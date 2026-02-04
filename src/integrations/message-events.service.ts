import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export type MessageEventPayload = {
  userId: string;
  phoneRaw: string;
  event: 'messages.upsert' | 'messages.update' | 'messages.send';
  wamid?: string | null;
};

@Injectable()
export class MessageEventsService {
  private readonly subject = new Subject<MessageEventPayload>();

  emit(payload: MessageEventPayload) {
    this.subject.next(payload);
  }

  on(): Observable<MessageEventPayload> {
    return this.subject.asObservable();
  }
}

