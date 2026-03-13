import { Centrifuge } from 'centrifuge';
import { queryClient } from './query-client.js';

let centrifuge: Centrifuge | null = null;

export const connectWebSocket = (token: string, tenantId: string) => {
  if (centrifuge) {
    centrifuge.disconnect();
  }

  centrifuge = new Centrifuge('ws://localhost:38000/connection/websocket', {
    token,
  });

  // Subscribe to tenant-level item updates
  const itemsSub = centrifuge.newSubscription(`blueprint:items#${tenantId}`);
  itemsSub.on('publication', (ctx) => {
    const event = ctx.data as { type: string; item_id?: string };
    // Invalidate items list cache
    queryClient.invalidateQueries({ queryKey: ['blueprint', 'items'] });
    // Invalidate specific item if applicable
    if (event.item_id) {
      queryClient.invalidateQueries({ queryKey: ['blueprint', 'item', event.item_id] });
    }
  });
  itemsSub.subscribe();

  centrifuge.connect();
};

export const disconnectWebSocket = () => {
  centrifuge?.disconnect();
  centrifuge = null;
};
