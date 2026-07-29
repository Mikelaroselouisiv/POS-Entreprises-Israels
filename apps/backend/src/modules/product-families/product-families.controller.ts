import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateProductFamilyDto,
  UpdateProductFamilyDto,
} from './dto/product-family.dto';
import { ProductFamiliesService } from './product-families.service';

@Controller('product-families')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductFamiliesController {
  constructor(private readonly productFamiliesService: ProductFamiliesService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  list(@Query('companyId', ParseIntPipe) companyId: number) {
    return this.productFamiliesService.list(companyId);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.productFamiliesService.getById(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() dto: CreateProductFamilyDto, @GetUser() user?: { id?: number }) {
    return this.productFamiliesService.create(dto, user?.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductFamilyDto,
    @GetUser() user?: { id?: number },
  ) {
    return this.productFamiliesService.update(id, dto, user?.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user?: { id?: number }) {
    return this.productFamiliesService.softDelete(id, user?.id);
  }
}
