// OWNER: Amabe
// TODO:
//   [x] PB-003  blocks and rooms management
//   [x] PB-004  occupancy (resident <-> room)
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Prisma, Priority, Role } from '@prisma/client';
import { z } from 'zod';
import { conflict, notFound } from '../common/app-exception';
import { Roles, Scope } from '../common/decorators';
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
const CategoryBody = z.object({ name: z.string().trim().min(1).max(100) });
const ItemBody = z.object({
  name: z.string().trim().min(1).max(100),
  defaultPriority: z.enum(Object.values(Priority) as [Priority, ...Priority[]]),
});
const ItemUpdateBody = ItemBody.partial().extend({ isActive: z.boolean().optional() }).refine(
  (body) => Object.keys(body).length > 0,
  'Provide at least one field to update',
);
const TargetBody = z.object({
  categoryId: z.string().trim().min(1).nullable().optional(),
  priority: z.enum(Object.values(Priority) as [Priority, ...Priority[]]),
  respondWithinH: z.number().int().min(1).max(8760),
  resolveWithinH: z.number().int().min(1).max(8760),
});

@Controller('properties')
export class PropertiesController {
  constructor(private readonly prisma: PrismaService) {}

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
    @Scope() scope: PropertyScope,
  ) {
    const existing = await this.prisma.faultCategory.findFirst({
      where: scope.where<Prisma.FaultCategoryWhereInput>({ name: body.name }),
    });
    if (existing) throw conflict('A fault category with this name already exists');
    try {
      return {
        category: await this.prisma.faultCategory.create({ data: scope.data({ name: body.name }) }),
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
    @Scope() scope: PropertyScope,
  ) {
    const category = await this.prisma.faultCategory.findFirst({ where: scope.where({ id }) });
    if (!category) throw notFound('Fault category not found');
    const duplicate = await this.prisma.faultCategory.findFirst({
      where: scope.where({ name: body.name, id: { not: id } }),
    });
    if (duplicate) throw conflict('A fault category with this name already exists');
    return { category: await this.prisma.faultCategory.update({ where: { id }, data: body }) };
  }

  @Delete('fault-categories/:id')
  @Roles(Role.ADMIN)
  async deleteCategory(@Param('id') id: string, @Scope() scope: PropertyScope) {
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

    await this.prisma.faultCategory.delete({ where: { id } });
    return { deleted: true, id };
  }

  @Post('fault-categories/:categoryId/items')
  @Roles(Role.ADMIN)
  async createItem(
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(ItemBody)) body: z.infer<typeof ItemBody>,
    @Scope() scope: PropertyScope,
  ) {
    const category = await this.prisma.faultCategory.findFirst({ where: scope.where({ id: categoryId }) });
    if (!category) throw notFound('Fault category not found');
    const existing = await this.prisma.faultItem.findFirst({ where: { categoryId, name: body.name } });
    if (existing) throw conflict('A fault item with this name already exists in this category');
    try {
      return { item: await this.prisma.faultItem.create({ data: { categoryId, ...body } }) };
    } catch (error) {
      if (isUniqueError(error)) throw conflict('A fault item with this name already exists in this category');
      throw error;
    }
  }

  @Patch('fault-items/:id')
  @Roles(Role.ADMIN)
  async updateItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ItemUpdateBody)) body: z.infer<typeof ItemUpdateBody>,
    @Scope() scope: PropertyScope,
  ) {
    const item = await this.prisma.faultItem.findFirst({
      where: scope.where<Prisma.FaultItemWhereInput>({ id }, 'category'),
    });
    if (!item) throw notFound('Fault item not found');
    if (body.name && body.name !== item.name) {
      const duplicate = await this.prisma.faultItem.findFirst({
        where: { categoryId: item.categoryId, name: body.name, id: { not: id } },
      });
      if (duplicate) throw conflict('A fault item with this name already exists in this category');
    }
    return { item: await this.prisma.faultItem.update({ where: { id }, data: body }) };
  }

  @Post('response-targets')
  @Roles(Role.ADMIN)
  async createTarget(
    @Body(new ZodValidationPipe(TargetBody)) body: z.infer<typeof TargetBody>,
    @Scope() scope: PropertyScope,
  ) {
    await this.assertCategory(body.categoryId, scope);
    await this.assertTargetAvailable(body.categoryId ?? null, body.priority, scope);
    try {
      return {
        responseTarget: await this.prisma.responseTarget.create({
          data: scope.data({ ...body, categoryId: body.categoryId ?? null }),
        }),
      };
    } catch (error) {
      if (isUniqueError(error)) throw conflict('A response target already exists for this priority and category');
      throw error;
    }
  }

  @Patch('response-targets/:id')
  @Roles(Role.ADMIN)
  async updateTarget(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TargetBody)) body: z.infer<typeof TargetBody>,
    @Scope() scope: PropertyScope,
  ) {
    const target = await this.prisma.responseTarget.findFirst({ where: scope.where({ id }) });
    if (!target) throw notFound('Response target not found');
    await this.assertCategory(body.categoryId, scope);
    await this.assertTargetAvailable(body.categoryId ?? null, body.priority, scope, id);
    return { responseTarget: await this.prisma.responseTarget.update({ where: { id }, data: body }) };
  }

  private async assertCategory(categoryId: string | null | undefined, scope: PropertyScope) {
    if (categoryId === null || categoryId === undefined) return;
    const category = await this.prisma.faultCategory.findFirst({ where: scope.where({ id: categoryId }) });
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
}

function isUniqueError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
