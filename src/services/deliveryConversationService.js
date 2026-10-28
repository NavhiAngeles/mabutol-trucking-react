export function deliveryConversationService(client) {
  const rpc = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw Error('Conversation unavailable. Check your connection and delivery access, then retry.');
    return data;
  };
  return {
    load: (delivery, before = null) => rpc('delivery_conversation', { p_delivery: delivery, p_before: before }),
    unread: () => rpc('delivery_conversation_unread'),
    send: (delivery, request, body, driver) => rpc('send_delivery_message', { p_delivery: delivery, p_request: request, p_body: body.trim(), p_driver: driver }),
    read: (delivery, ids) => rpc('read_delivery_messages', { p_delivery: delivery, p_ids: ids }),
    watch(delivery, changed) {
      const channel = client.channel(`conversation-${delivery}-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_messages', ...(delivery ? { filter: `delivery_id=eq.${delivery}` } : {}) }, changed)
        .subscribe();
      return () => { void client.removeChannel(channel); };
    },
  };
}

// A lost response must keep the same key/body. Editing is allowed after confirmation.
export class PendingDeliveryMessage {
  pending = null;
  sending = false;
  constructor(service, delivery, newId = () => crypto.randomUUID()) {
    this.service = service; this.delivery = delivery; this.newId = newId;
  }
  async send(body) {
    if (this.sending) return null;
    if (!this.pending) {
      if (!body.trim() || [...body.trim()].length > 2000) throw Error('Enter a message of 1–2000 characters.');
      this.pending = { request: this.newId(), body: body.trim() };
    }
    this.sending = true;
    try {
      const result = await this.service.send(this.delivery, this.pending.request, this.pending.body);
      this.pending = null;
      return result;
    } finally { this.sending = false; }
  }
}
