// OWNER: Amabe
// TODO:
//   [x] PB-003  blocks and rooms management
//   [x] PB-004  occupancy (resident <-> room)
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
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
const CreateFacilityBody = z.object({
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().max(200).optional(),
});
const UpdateFacilityBody = CreateFacilityBody.partial().extend({ isActive: z.boolean().optional() });

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
