import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaypalTransactionsQueryDto } from './dto/paypal-transactions-query.dto';
import { PaypalTransactionsService } from './paypal-transactions.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

@Controller('paypal')
export class PaypalTransactionsController {
  constructor(private readonly paypalTransactionsService: PaypalTransactionsService) {}

  @Get('transactions')
  listTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaypalTransactionsQueryDto
  ) {
    return this.paypalTransactionsService.listTransactions(user.userId, query);
  }
}

