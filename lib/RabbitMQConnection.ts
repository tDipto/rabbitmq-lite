import { RabbitMQClient } from "./RabbitMQClient";

export class RabbitMQConnection {
  private static rabbitMQClient: RabbitMQClient | null = null;
  private static connectionUrl: string = "";
  private static consumers: Array<any> = [];
  private static isConnecting: boolean = false;
  private static isReconnecting: boolean = false;

  private constructor() {}

  static getClient(): RabbitMQClient {
    if (!RabbitMQConnection.rabbitMQClient) {
      throw new Error(
        "RabbitMQ client not initialized. Call connect before accessing the client."
      );
    }
    return RabbitMQConnection.rabbitMQClient;
  }

  static registerConsumers(consumers: Array<any>): void {
    this.consumers = consumers;
  }

  static async connect(
    rabbitMQUrl: string,
    retryOnFail: boolean = true
  ): Promise<void> {
    if (this.isConnecting) {
      console.log("Connection already in progress, waiting...");
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.connectionUrl = rabbitMQUrl;

    if (
      RabbitMQConnection.rabbitMQClient &&
      RabbitMQConnection.rabbitMQClient.getConnectionStatus()
    ) {
      return;
    }

    this.isConnecting = true;

    let connected = false;

    while (!connected) {
      try {
        console.log(`Attempting to connect to RabbitMQ...`);

        RabbitMQConnection.rabbitMQClient = new RabbitMQClient(rabbitMQUrl);
        await RabbitMQConnection.rabbitMQClient.connect();

        // Set up auto-reconnection on connection loss
        RabbitMQConnection.rabbitMQClient.onConnectionLost(() => {
          this.handleConnectionLost();
        });

        connected = true;
        console.log("RabbitMQ connected successfully!");
      } catch (error) {
        console.error(`RabbitMQ connection attempt failed:`, error);
        RabbitMQConnection.rabbitMQClient = null;

        if (!retryOnFail) {
          this.isConnecting = false;
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    this.isConnecting = false;

    if (this.consumers.length > 0) {
      await this.startConsumers();
    }
  }

  private static async startConsumers(): Promise<void> {
    console.log(`Starting ${this.consumers.length} consumers...`);

    for (const consumer of this.consumers) {
      try {
        await consumer.consume();
        console.log(`Consumer started: ${consumer.constructor.name}`);
      } catch (error) {
        console.error(`Failed to start consumer:`, error);
      }
    }
  }

  private static async handleConnectionLost(): Promise<void> {
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    console.error("RabbitMQ connection lost! Attempting to reconnect...");

    RabbitMQConnection.rabbitMQClient = null;

    try {
      await this.connect(this.connectionUrl, true);
      console.log("Reconnected and consumers restarted!");
    } catch (error) {
      console.error("Failed to reconnect:", error);
    } finally {
      this.isReconnecting = false;
    }
  }

  static async close(): Promise<void> {
    if (!RabbitMQConnection.rabbitMQClient) {
      throw new Error(
        "RabbitMQ client not initialized. Call connect before accessing the client."
      );
    }
    await RabbitMQConnection.rabbitMQClient.close();
    RabbitMQConnection.rabbitMQClient = null;
  }

  static isConnected(): boolean {
    return (
      RabbitMQConnection.rabbitMQClient !== null &&
      RabbitMQConnection.rabbitMQClient.getConnectionStatus()
    );
  }

  static reset(): void {
    RabbitMQConnection.rabbitMQClient = null;
    this.isConnecting = false;
  }
}
