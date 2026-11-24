import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamType, Holiday } from '../database/entities/index.js';
import { CatalogController } from './catalog.controller.js';

@Module({ imports: [TypeOrmModule.forFeature([ExamType, Holiday])], controllers: [CatalogController] })
export class CatalogModule {}
