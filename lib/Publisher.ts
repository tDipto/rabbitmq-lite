import { RabbitMQClient } from "./RabbitMQClient";
import { RabbitMQConnection } from "./RabbitMQConnection";

export abstract class Publisher {
  protected queueName: string;
  protected options: object;
  private _rabbitMQClient: RabbitMQClient | null = null;

  constructor(queueName: string, options = {}) {
    this.queueName = queueName;
    this.options = options;
  }

  protected get rabbitMQClient(): RabbitMQClient {
    if (!this._rabbitMQClient) {
      this._rabbitMQClient = RabbitMQConnection.getClient();
    }
    return this._rabbitMQClient;
  }

  abstract publish<MessageType extends object>(message: MessageType): void;
}
