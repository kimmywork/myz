export interface User {
  id: string
  name?: string
}

export interface IncomingMessage {
  id: string
  text: string
  userId: string
  userName?: string
  timestamp: string
}

export interface OutgoingMessage {
  id: string
  text: string
  timestamp: string
}

export interface MessageChannel {
  send(text: string): Promise<OutgoingMessage>
  receive(): AsyncIterable<IncomingMessage>
}
