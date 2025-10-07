import { ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { validationPipeOptions } from '../app-setup';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

describe('PortfolioController', () => {
  let controller: PortfolioController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortfolioController],
      providers: [
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe(validationPipeOptions),
        },
        {
          provide: PortfolioService,
          useValue: {
            registerInstrument: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PortfolioController>(PortfolioController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
