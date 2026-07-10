import { Module } from '@nestjs/common';
import { MaterialesService } from './materiales.service';
import { MaterialesController } from './materiales.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [MaterialesService],
  controllers: [MaterialesController],
  exports: [MaterialesService],
})
export class MaterialesModule {}
