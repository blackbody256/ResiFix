// OWNER: Amabe
// TODO:
//   [x] PB-003  blocks and rooms management
//   [x] PB-004  occupancy (resident <-> room)
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Prisma, Priority, Role } from '@prisma/client';
import { z } from 'zod';
import { conflict, notFound } from '../common/app-exception';
import { CurrentUser, Roles, Scope } from '../common/decorators';
import type { AuthUser } from '../auth/auth-user';
import { AuditService } from '../common/audit.service';
import type { PropertyScope } from '../common/property-scope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

const CreateBlockBody = z.object({ name: z.string().trim().min(1).max(100) });
const CreateRoomBody = z.object({
  number: z.string().trim().min(1).max(50),
  capacity: z.number().int().min(1).max(100).default(1),
});
const CreateOccupancyBody = z.object({
  userId: z.string().trim().min(1),
  roomId: z.string().trim().min(1),
});
const CreateFacilityBody = z.object({
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().max(200).nullable().optional(),
});
const CategoryBody = z.object({ name: z.string().trim().min(1).max(100) });
const ItemBody = z.object({
  name: z.string().trim().min(1).max(100),
  defaultPriority: z.enum(Object.values(Priority) as [Priority, ...Priority[]]),
});
const ItemUpdateBody = ItemBody.partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');
const TargetBody = z.object({
  categoryId: z.string().trim().min(1).nullable().optional(),
  priority: z.enum(Object.values(Priority) as [Priority, ...Priority[]]),
  respondWithinH: z.number().int().min(1).max(8760),
  resolveWithinH: z.number().int().min(1).max(8760),
});
const UpdateFacilityBody = CreateFacilityBody.partial().extend({
  isActive: z.boolean().optional(),
});

@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Working example of a scoped read. GET /api/properties/mine */
  @Get('mine')
  async mine(@Scope() scope: PropertyScope) {
    const property = await this.prisma.property.findUniqueOrThrow({
      where: { id: scope.propertyId },
      include: {
        blocks: { orderBy: { name: 'asc' }, include: { rooms: { orderBy: { number: 'asc' } } } },
      },
    });
    return { property };
  }

  @Get('catalogue')
  @Roles(Role.ADMIN)
  async catalogue(@Scope() scope: PropertyScope) {
    const [categories, responseTargets] = await Promise.all([
      this.prisma.faultCategory.findMany({
        where: scope.where<Prisma.FaultCategoryWhereInput>(),
        orderBy: { name: 'asc' },
        include: { items: { orderBy: { name: 'asc' } } },
      }),
      this.prisma.responseTarget.findMany({
        where: scope.where<Prisma.ResponseTargetWhereInput>(),
        orderBy: [{ priority: 'asc' }, { categoryId: 'asc' }],
        include: { category: { select: { id: true, name: true } } },
      }),
    ]);
    return { categories, responseTargets };
  }

  @Post('fault-categories')
  @Roles(Role.ADMIN)
  async createCategory(
    @Body(new ZodValidationPipe(CategoryBody)) body: z.infer<typeof CategoryBody>,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    const existing = await this.prisma.faultCategory.findFirst({
      where: scope.where<Prisma.FaultCategoryWhereInput>({ name: body.name }),
    });
    if (existing) throw conflict('A fault category with this name already exists');
    try {
      const category = await this.prisma.$transaction(async (tx) => {
        const created = await tx.faultCategory.create({ data: scope.data({ name: body.name }) });
        await this.audit.record(
          {
            propertyId: scope.propertyId,
            actorId: user.id,
            action: 'fault_category.created',
            meta: { categoryId: created.id, name: created.name },
          },
          tx,
        );
        return created;
      });
      return {
        category,
      };
    } catch (error) {
      if (isUniqueError(error)) throw conflict('A fault category with this name already exists');
      throw error;
    }
  }

  @Patch('fault-categories/:id')
  @Roles(Role.ADMIN)
  async renameCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CategoryBody)) body: z.infer<typeof CategoryBody>,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    const existingCategory = await this.prisma.faultCategory.findFirst({
      where: scope.where({ id }),
    });
    if (!existingCategory) throw notFound('Fault category not found');
    const duplicate = await this.prisma.faultCategory.findFirst({
      where: scope.where({ name: body.name, id: { not: id } }),
    });
    if (duplicate) throw conflict('A fault category with this name already exists');
    const category = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.faultCategory.update({ where: { id }, data: body });
      await this.audit.record(
        {
          propertyId: scope.propertyId,
          actorId: user.id,
          action: 'fault_category.renamed',
          meta: { categoryId: id, from: existingCategory.name, to: body.name },
        },
        tx,
      );
      return updated;
    });
    return { category };
  }

  @Delete('fault-categories/:id')
  @Roles(Role.ADMIN)
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    const category = await this.prisma.faultCategory.findFirst({
      where: scope.where({ id }),
      include: { _count: { select: { items: true } } },
    });
    if (!category) throw notFound('Fault category not found');
    if (category._count.items > 0) {
      throw conflict('This category still has fault items. Remove or deactivate them first.');
    }

    const ticketCount = await this.prisma.ticket.count({
      where: {
        faultItem: { categoryId: id, category: { propertyId: scope.propertyId } },
      },
    });
    if (ticketCount > 0) {
      throw conflict('This category has ticket history and cannot be deleted. Rename it instead.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.faultCategory.delete({ where: { id } });
      await this.audit.record(
        {
          propertyId: scope.propertyId,
          actorId: user.id,
          action: 'fault_category.deleted',
          meta: { categoryId: id, name: category.name },
        },
        tx,
      );
    });
    return { deleted: true, id };
  }

  @Post('fault-categories/:categoryId/items')
  @Roles(Role.ADMIN)
  async createItem(
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(ItemBody)) body: z.infer<typeof ItemBody>,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    const category = await this.prisma.faultCategory.findFirst({
      where: scope.where({ id: categoryId }),
    });
    if (!category) throw notFound('Fault category not found');
    const existing = await this.prisma.faultItem.findFirst({
      where: { categoryId, name: body.name },
    });
    if (existing) throw conflict('A fault item with this name already exists in this category');
    try {
      const item = await this.prisma.$transaction(async (tx) => {
        const created = await tx.faultItem.create({ data: { categoryId, ...body } });
        await this.audit.record(
          {
            propertyId: scope.propertyId,
            actorId: user.id,
            action: 'fault_item.created',
            meta: { itemId: created.id, categoryId, name: created.name },
          },
          tx,
        );
        return created;
      });
      return { item };
    } catch (error) {
      if (isUniqueError(error))
        throw conflict('A fault item with this name already exists in this category');
      throw error;
    }
  }

  @Patch('fault-items/:id')
  @Roles(Role.ADMIN)
  async updateItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ItemUpdateBody)) body: z.infer<typeof ItemUpdateBody>,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    const existingItem = await this.prisma.faultItem.findFirst({
      where: scope.where<Prisma.FaultItemWhereInput>({ id }, 'category'),
    });
    if (!existingItem) throw notFound('Fault item not found');
    if (body.name && body.name !== existingItem.name) {
      const duplicate = await this.prisma.faultItem.findFirst({
        where: { categoryId: existingItem.categoryId, name: body.name, id: { not: id } },
      });
      if (duplicate) throw conflict('A fault item with this name already exists in this category');
    }
    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.faultItem.update({ where: { id }, data: body });
      await this.audit.record(
        {
          propertyId: scope.propertyId,
          actorId: user.id,
          action: 'fault_item.updated',
          meta: { itemId: id, categoryId: existingItem.categoryId, changes: body },
        },
        tx,
      );
      return updated;
    });
    return { item };
  }

  @Post('response-targets')
  @Roles(Role.ADMIN)
  async createTarget(
    @Body(new ZodValidationPipe(TargetBody)) body: z.infer<typeof TargetBody>,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    await this.assertCategory(body.categoryId, scope);
    await this.assertTargetAvailable(body.categoryId ?? null, body.priority, scope);
    try {
      const responseTarget = await this.prisma.$transaction(async (tx) => {
        const created = await tx.responseTarget.create({
          data: scope.data({ ...body, categoryId: body.categoryId ?? null }),
        });
        await this.audit.record(
          {
            propertyId: scope.propertyId,
            actorId: user.id,
            action: 'response_target.created',
            meta: {
              responseTargetId: created.id,
              categoryId: created.categoryId,
              priority: created.priority,
              respondWithinH: created.respondWithinH,
              resolveWithinH: created.resolveWithinH,
            },
          },
          tx,
        );
        return created;
      });
      return { responseTarget };
    } catch (error) {
      if (isUniqueError(error))
        throw conflict('A response target already exists for this priority and category');
      throw error;
    }
  }

  @Patch('response-targets/:id')
  @Roles(Role.ADMIN)
  async updateTarget(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TargetBody)) body: z.infer<typeof TargetBody>,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    const target = await this.prisma.responseTarget.findFirst({ where: scope.where({ id }) });
    if (!target) throw notFound('Response target not found');
    const categoryId = body.categoryId === undefined ? target.categoryId : body.categoryId;
    await this.assertCategory(categoryId, scope);
    await this.assertTargetAvailable(categoryId, body.priority, scope, id);
    const responseTarget = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.responseTarget.update({
        where: { id },
        data: { ...body, categoryId },
      });
      await this.audit.record(
        {
          propertyId: scope.propertyId,
          actorId: user.id,
          action: 'response_target.updated',
          meta: {
            responseTargetId: id,
            categoryId: updated.categoryId,
            priority: updated.priority,
            respondWithinH: updated.respondWithinH,
            resolveWithinH: updated.resolveWithinH,
          },
        },
        tx,
      );
      return updated;
    });
    return { responseTarget };
  }

  private async assertCategory(categoryId: string | null | undefined, scope: PropertyScope) {
    if (categoryId === null || categoryId === undefined) return;
    const category = await this.prisma.faultCategory.findFirst({
      where: scope.where({ id: categoryId }),
    });
    if (!category) throw notFound('Fault category not found');
  }

  private async assertTargetAvailable(
    categoryId: string | null,
    priority: Priority,
    scope: PropertyScope,
    exceptId?: string,
  ) {
    const existing = await this.prisma.responseTarget.findFirst({
      where: scope.where({ categoryId, priority, ...(exceptId && { id: { not: exceptId } }) }),
    });
    if (existing) throw conflict('A response target already exists for this priority and category');
  }

  @Post('blocks')
  @Roles(Role.ADMIN)
  async createBlock(
    @Body(new ZodValidationPipe(CreateBlockBody)) body: z.infer<typeof CreateBlockBody>,
    @Scope() scope: PropertyScope,
  ) {
    const existing = await this.prisma.block.findFirst({
      where: scope.where<Prisma.BlockWhereInput>({ name: body.name }),
    });
    if (existing) throw conflict('A block with this name already exists');

    try {
      const block = await this.prisma.block.create({ data: scope.data({ name: body.name }) });
      return { block };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('A block with this name already exists');
      }
      throw error;
    }
  }

  @Post('blocks/:blockId/rooms')
  @Roles(Role.ADMIN)
  async createRoom(
    @Param('blockId') blockId: string,
    @Body(new ZodValidationPipe(CreateRoomBody)) body: z.infer<typeof CreateRoomBody>,
    @Scope() scope: PropertyScope,
  ) {
    const block = await this.prisma.block.findFirst({
      where: scope.where<Prisma.BlockWhereInput>({ id: blockId }),
    });
    if (!block) throw notFound('Block not found');

    const existing = await this.prisma.room.findFirst({
      where: { blockId, number: body.number },
    });
    if (existing) throw conflict('A room with this number already exists in this block');

    try {
      const room = await this.prisma.room.create({
        data: { blockId, number: body.number, capacity: body.capacity },
      });
      return { room };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('A room with this number already exists in this block');
      }
      throw error;
    }
  }

  @Post('occupancies')
  @Roles(Role.ADMIN)
  async createOccupancy(
    @Body(new ZodValidationPipe(CreateOccupancyBody)) body: z.infer<typeof CreateOccupancyBody>,
    @Scope() scope: PropertyScope,
  ) {
    const [user, room] = await Promise.all([
      this.prisma.user.findFirst({
        where: scope.where<Prisma.UserWhereInput>({ id: body.userId, role: Role.RESIDENT }),
      }),
      this.prisma.room.findFirst({
        where: scope.where<Prisma.RoomWhereInput>({ id: body.roomId }, 'block'),
      }),
    ]);
    if (!user) throw notFound('Resident not found');
    if (!room) throw notFound('Room not found');

    const activeOccupancy = await this.prisma.occupancy.findFirst({
      where: { userId: user.id, endDate: null },
    });
    if (activeOccupancy) throw conflict('Resident already has an active room assignment');

    const occupied = await this.prisma.occupancy.count({
      where: { roomId: room.id, endDate: null },
    });
    if (occupied >= room.capacity) throw conflict('Room is at full capacity');

    const occupancy = await this.prisma.occupancy.create({
      data: { userId: user.id, roomId: room.id },
    });
    return { occupancy };
  }

  @Get('facilities')
  async facilities(@Scope() scope: PropertyScope) {
    const facilities = await this.prisma.facility.findMany({
      where: { propertyId: scope.propertyId },
      orderBy: { name: 'asc' },
    });
    return { facilities };
  }

  @Post('facilities')
  @Roles(Role.ADMIN)
  async createFacility(
    @Body(new ZodValidationPipe(CreateFacilityBody)) body: z.infer<typeof CreateFacilityBody>,
    @Scope() scope: PropertyScope,
  ) {
    try {
      const facility = await this.prisma.facility.create({ data: scope.data(body) });
      return { facility };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('A facility with this name already exists');
      }
      throw error;
    }
  }

  @Patch('facilities/:id')
  @Roles(Role.ADMIN)
  async updateFacility(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFacilityBody)) body: z.infer<typeof UpdateFacilityBody>,
    @Scope() scope: PropertyScope,
  ) {
    const existing = await this.prisma.facility.findFirst({
      where: { id, propertyId: scope.propertyId },
    });
    if (!existing) throw notFound('Facility not found');
    try {
      const facility = await this.prisma.facility.update({ where: { id }, data: body });
      return { facility };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('A facility with this name already exists');
      }
      throw error;
    }
  }
}

function isUniqueError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
