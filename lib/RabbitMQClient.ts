import * as amqp from "amqplib";

declare type Options = {
  exchange?: string;
  routingKey?: string;
  persistent?: boolean;
  delay?: number;
  exchangeType?: "direct" | "fanout" | "topic";
  headers?: object;
};
export class RabbitMQClient {
  private static connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private isConnected: boolean = false;
  private connectionLostCallback: (() => void) | null = null;

  public constructor(private url: string) {
    this.url = url;
  }

  getChannel(): amqp.Channel {
    if (!this.channel) {
      throw new Error("Channel not initialized. Connection may have failed.");
    }
    return this.channel;
  }

  onConnectionLost(callback: () => void): void {
    this.connectionLostCallback = callback;
  }

  getConnectionStatus(): boolean {
    return this.isConnected && this.channel !== null;
  }

  async connect(): Promise<void> {

    if (!RabbitMQClient.connection) {
      RabbitMQClient.connection = await amqp.connect(this.url);

      RabbitMQClient.connection.on("close", () => {
        console.error("RabbitMQ connection closed");
        this.isConnected = false;
        this.channel = null;
        RabbitMQClient.connection = null;

        if (this.connectionLostCallback) {
          this.connectionLostCallback();
        }
      });

      RabbitMQClient.connection.on("error", (err) => {
        console.error("RabbitMQ connection error:", err);
        this.isConnected = false;
        this.channel = null;
      });
    }
    this.channel = await RabbitMQClient.connection.createChannel();

    this.channel.on("close", () => {
      console.error("RabbitMQ channel closed");
      this.channel = null;
    });

    this.channel.on("error", (err) => {
      console.error("RabbitMQ channel error:", err);
    });

    this.isConnected = true;
  }

  async publish<MessageType>(
    queue: string,
    message: MessageType,
    options: Options = {}
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("Cannot publish: RabbitMQ channel not initialized");
    }

    try {
      // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
      // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
      const defaultOptions: Options = {
        exchange: `Exchange_${queue}`,
        routingKey: queue,
        delay: 0,
        exchangeType: "direct",
        headers: {},
      };
      const mergedOptions = { ...defaultOptions, ...options };

      // Declare the delayed exchange
      await this.channel.assertExchange(
        `${mergedOptions.exchange}-delayed`,
        "x-delayed-message",
        {
          durable: true,
          arguments: {
            "x-delayed-type": mergedOptions.exchangeType,
          },
        }
      );

      // Declare the queue
      await this.channel.assertQueue(queue, { durable: true });

      // Bind the queue to the delayed exchange with the routing key
      await this.channel.bindQueue(
        queue,
        `${mergedOptions.exchange}-delayed`,
        mergedOptions.routingKey
      );

      const delayedMessage: amqp.Message = {
        properties: {
          headers: {
            ...mergedOptions.headers,
            "x-delay": mergedOptions.delay,
          },
        },
        content: Buffer.from(JSON.stringify(message)),
      };

      await this.channel.publish(
        `${mergedOptions.exchange}-delayed`,
        mergedOptions.routingKey,
        delayedMessage.content,
        delayedMessage.properties
      );

      console.log("Message published:", message);
    } catch (error) {
      if (
        error.message?.includes("Channel closed") ||
        error.message?.includes("Connection closed")
      ) {
        this.isConnected = false;
        this.channel = null;
      }
      console.error("Error publishing message:", error);
      throw error;
    }
  }

  async sendToQueue<MessageType>(
    queue: string,
    message: MessageType,
    options: Options = {}
  ) {
    if (!this.channel) {
      throw new Error("Cannot send to queue: RabbitMQ channel not initialized");
    }

    try {
      await this.channel.assertQueue(queue, { durable: true });
      // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
      // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
      const defaultOptions: Options = {
        exchange: `Exchange_${queue}`,
        routingKey: queue,
        delay: 0,
        exchangeType: "direct",
        headers: {},
      };
      const mergedOptions = { ...defaultOptions, ...options };
      if (mergedOptions.delay && mergedOptions.delay > 0) {
        await this.channel.assertExchange(
          `${mergedOptions.exchange}-delayed`,
          "x-delayed-message",
          {
            durable: true,
            arguments: {
              "x-delayed-type": mergedOptions.exchangeType,
            },
          }
        );

        await this.channel.bindQueue(
          queue,
          `${mergedOptions.exchange}-delayed`,
          mergedOptions.routingKey
        );
        const headers = {
          "x-delay": mergedOptions.delay,
        };
        let mergedHeader = {
          ...headers,
        };

        if (options.hasOwnProperty("headers")) {
          mergedHeader = {
            ...options.headers,
            ...headers,
          };
        }
        const delayedMessage: amqp.Message = {
          properties: {
            headers: mergedHeader,
          },
          content: Buffer.from(JSON.stringify(message)),
        };

        await this.channel.publish(
          `${mergedOptions.exchange}-delayed`,
          mergedOptions.routingKey,
          delayedMessage.content,
          delayedMessage.properties
        );
      } else {
        await this.channel.sendToQueue(
          queue,
          Buffer.from(JSON.stringify(message)),
          options
        );
      }

      console.log("Message sent to queue:", queue);
    } catch (error) {
      if (
        error.message?.includes("Channel closed") ||
        error.message?.includes("Connection closed")
      ) {
        this.isConnected = false;
        this.channel = null;
      }
      console.error("Error sending message to queue:", error);
      throw error;
    }
  }
  async consume(
    queue: string,
    callback: (message: amqp.ConsumeMessage | null) => void
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("Cannot consume: RabbitMQ channel not initialized");
    }
    try {
      await this.channel.assertQueue(queue, { durable: true });
      await this.channel.consume(queue, callback, { noAck: false });
      console.log("Consuming messages from queue:", queue);
    } catch (error) {
      console.error("Error consuming messages:", error);
      throw error;
    }
  }

  async ack(message: amqp.ConsumeMessage | null): Promise<void> {
    if (message && this.channel) {
      this.channel.ack(message);
    }
  }

  async nack(message: amqp.ConsumeMessage | null): Promise<void> {
    if (message && this.channel) {
      this.channel.nack(message);
    }
  }
  async getConsumerCount(queue: string): Promise<number> {
    if (!this.channel) {
      throw new Error(
        "Cannot get consumer count: RabbitMQ channel not initialized"
      );
    }
    try {
      const { consumerCount } = await this.channel.assertQueue(queue, {
        durable: true,
      });
      console.log(`Consumer count for queue "${queue}": ${consumerCount}`);
      return consumerCount;
    } catch (error) {
      console.error("Error getting consumer count:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (RabbitMQClient.connection) {
        await RabbitMQClient.connection.close();
        RabbitMQClient.connection = null;
      }
      this.isConnected = false;
      console.log("Disconnected from RabbitMQ");
    } catch (error) {
      console.error("Error closing RabbitMQ connection:", error);
      throw error;
    }
  }
}
