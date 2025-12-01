# rabbitmq-lite

A lightweight RabbitMQ helper library for Node.js with TypeScript support. Simplifies message publishing and consuming with built-in retry logic, error handling, and automatic reconnection.

## Features

- 🚀 **Simple API** - Easy-to-use abstract classes for consumers and publishers
- 🔄 **Automatic Retry** - Built-in retry mechanism with configurable retry count and delay
- 🛡️ **Error Handling** - Automatic error queue management for failed messages
- 🔌 **Auto-Reconnection** - Automatic reconnection on connection loss
- 📦 **TypeScript** - Full TypeScript support with type definitions
- 🔗 **Shared Connection** - Single shared connection for all consumers and publishers

## Installation

```bash
npm install rabbitmq-lite
```

## How to Use

### 1. Initialize RabbitMQ Connection

```typescript
import { RabbitMQConnection } from "rabbitmq-lite";
import { writeLogInfo } from "@libraries/logger/LoggerBuilder";

const initRabbitMQ = async () => {
  RabbitMQConnection.registerConsumers(consumerRegister);
  await RabbitMQConnection.connect(config.rabbitMqConnectionUrl);

  writeLogInfo({
    action: "RabbitMQ.Initialized",
  });
};
```

### 2. Register All Consumers

```typescript
import { ProcessPaymentConsumer } from "@consumers/ProcessPaymentConsumer";
import { OrderConsumer } from "@consumers/OrderConsumer";

export const consumerRegister: any[] = [
  new ProcessPaymentConsumer(),
  new OrderConsumer(),
];
```

### 3. Create Consumers

```typescript
import { CONSUMER_QUEUES } from "@configs/constant";
import { Consumer } from "rabbitmq-lite";
import { writeLogInfo } from "@libraries/logger/LoggerBuilder";
import PaymentService from "@services/implementations/PaymentService";

export class ProcessPaymentConsumer extends Consumer {
  constructor() {
    const queueName = CONSUMER_QUEUES.PROCESS_PAYMENT;
    super(queueName, {
      retry: true,
      retry_count: 3,
      retry_delay: 1000,
    });
  }

  /**
   * @description Process payment message
   * @param message - payment message
   */
  async execute<T extends object>(message: T): Promise<void> {
    writeLogInfo({
      action: `ProcessPayment.Queue.execute.received : ${message}`,
      metrics: { timestamp: Date.now() },
    });

    const paymentService = new PaymentService();
    await paymentService.processPayment(message);
  }
}
```

### 4. Create Publishers

```typescript
import { CONSUMER_QUEUES } from "@configs/constant";
import { Publisher } from "rabbitmq-lite";

export class ProcessPaymentPublisher extends Publisher {
  constructor() {
    const queueName = CONSUMER_QUEUES.PROCESS_PAYMENT;
    super(queueName);
  }

  async publish<MessageType>(message: MessageType): Promise<void> {
    try {
      await this.rabbitMQClient.publish(this.queueName, message);
    } catch (error) {
      console.error("Error publishing messages:", error);
    }
  }
}
```

### 5. Publish Messages

```typescript
const publisher = new ProcessPaymentPublisher();
await publisher.publish({
  paymentId: "12345",
  amount: 100.0,
  currency: "USD",
});
```

## API Reference

### RabbitMQConnection

Static class for managing RabbitMQ connections.

- `connect(rabbitMQUrl: string, retryOnFail?: boolean): Promise<void>` - Establishes connection
- `registerConsumers(consumers: Array<Consumer>): void` - Registers consumers
- `getClient(): RabbitMQClient` - Returns shared client instance
- `isConnected(): boolean` - Checks connection status
- `close(): Promise<void>` - Closes connection
- `reset(): void` - Resets connection state (for testing)

### Consumer

Abstract class for consuming messages from RabbitMQ queues.

**Constructor:**

```typescript
constructor(queueName: string, options?: ConsumerOptions)
```

**Options:**

- `retry` (boolean): Enable retry on error (default: `true`)
- `retry_count` (number): Maximum retry attempts (default: `3`)
- `retry_delay` (number): Delay between retries in milliseconds (default: `0`)

**Methods:**

- `execute<MessageType>(message: MessageType): Promise<void>` - Implement this to process messages

### Publisher

Abstract class for publishing messages to RabbitMQ queues.

**Constructor:**

```typescript
constructor(queueName: string, options?: object)
```

**Methods:**

- `publish<MessageType>(message: MessageType): Promise<void>` - Implement this to publish messages

**Protected Properties:**

- `rabbitMQClient` - Access to shared RabbitMQ client
- `queueName` - The queue name
- `options` - Publishing options

## Error Handling

When a consumer's `execute` method throws an error:

1. If `retry` is `false`, the message is acknowledged and discarded
2. If `retry` is `true`:
   - Message is retried up to `retry_count` times
   - Each retry includes a `delay` (if specified)
   - After max retries, message is sent to `{queueName}_error` queue

Failed messages are automatically sent to an error queue named `{queueName}_error`. Create a consumer for this queue to handle failed messages:

```typescript
class ErrorHandler extends Consumer {
  constructor() {
    super("process_payment_error", { retry: false });
  }

  async execute<MessageType>(message: MessageType): Promise<void> {
    // Handle failed messages
    console.error("Failed message:", message);
  }
}
```

## Connection Management

The library automatically handles connection loss:

- Detects when connection is lost
- Automatically attempts to reconnect
- Restarts all registered consumers after reconnection

```typescript
// Check connection status
if (RabbitMQConnection.isConnected()) {
  console.log("Connected!");
}

// Close connection
await RabbitMQConnection.close();
```

## License

MIT

## Author

Tanzim

## Repository

[GitHub](https://github.com/tDipto/rabbitmq-lite)
