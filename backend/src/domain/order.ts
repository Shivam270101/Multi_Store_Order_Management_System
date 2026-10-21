export const orderStatuses = ["PLACED", "PREPARING", "COMPLETED"] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export interface OrderItem {
  item_id: string;
  qty: number;
  unit_price: number;
}

export interface Order {
  id: number;
  store_id: string;
  items: OrderItem[];
  total_amount: number;
  status: OrderStatus;
  created_at: string;
}

export function storeRoom(storeId: string): string {
  return `store:${storeId}`;
}
