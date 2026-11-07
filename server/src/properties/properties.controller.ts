// OWNER: Amabe
// TODO:
//   [ ] PB-003  blocks and rooms management
//   [ ] PB-004  occupancy (resident <-> room)
import { Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { notImplemented } from '../common/app-exception';
import { Roles, Scope } from '../common/decorators';
import type { PropertyScope } from '../common/property-scope';
import { PrismaService } from '../prisma/prisma.service';

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
  createBlock() {
    notImplemented('PB-003');
  }

  @Post('blocks/:blockId/rooms')
  @Roles(Role.ADMIN)
  createRoom() {
    notImplemented('PB-003');
  }

  @Post('occupancies')
  @Roles(Role.ADMIN)
  createOccupancy() {
    notImplemented('PB-004');
  }
}
