export interface RefundStats {
  totalUsers: number;
  totalAccountsClosed: number;
  totalSolRefunded: number;
  lastUpdated: string;
}

export interface Transaction {
  id: string;
  walletAddress: string;
  accountsClosed: number;
  refundedSol: number;
  txSignature: string;
  createdAt: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CreateTransactionRequest {
  walletAddress: string;
  accountsClosed: number;
  refundedSol: number;
  txSignature?: string;
}

export type ServerEvent =
  | { type: "stats"; payload: RefundStats }
  | { type: "transaction"; payload: Transaction };
