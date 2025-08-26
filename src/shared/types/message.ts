export interface MessagePayload {
    type: 'webhook' | 'email' | 'sms';
    id: string;
    retry_count: number;
    payload: {
    documentUrl?: string;
    correlationId?: string;
    event?: string;
    webhook_url?: string;
    to?: string;
    subject?: string;
    phone?: string;
    text?: string;
  };
    
}