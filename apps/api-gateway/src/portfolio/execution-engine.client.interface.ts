import {
  ListPortfolioExecutionOrdersRequest,
  ListPortfolioExecutionOrdersResponse,
} from '@trading-bot/common/proto';
import { Observable } from 'rxjs';

export interface IExecutionEngine {
  listPortfolioExecutionOrders(
    data: ListPortfolioExecutionOrdersRequest,
  ): Observable<ListPortfolioExecutionOrdersResponse>;
}
