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

## Quick Start

### 1. Initialize RabbitMQ Connection

First, establish a connection to your RabbitMQ server:

```typescript
import { RabbitMQConnection } from "rabbitmq-lite";

// Initialize connection
await RabbitMQConnection.connect("amqp://localhost");

// Or with retry on failure (default: true)
await RabbitMQConnection.connect("amqp://localhost", true);
```

### 2. Create a Consumer

Extend the `Consumer` class to create your message consumer:

```typescript
import { Consumer } from "rabbitmq-lite";

class OrderProcessor extends Consumer {
  constructor() {
    super("order_queue", {
      retry: true, // Enable retry on error
      retry_count: 3, // Maximum retry attempts
      retry_delay: 1000, // Delay between retries (ms)
    });
  }

  async execute<OrderMessage>(message: OrderMessage): Promise<void> {
    // Process your message here
    console.log("Processing order:", message);

    // Your business logic
    // If an error is thrown, the retry mechanism will handle it
  }
}
```

### 3. Create a Publisher

Extend the `Publisher` class to create your message publisher:

```typescript
import { Publisher } from "rabbitmq-lite";

class OrderPublisher extends Publisher {
  constructor() {
    super("order_queue", {
      persistent: true, // Make messages persistent
    });
  }

  async publish<OrderMessage>(message: OrderMessage): Promise<void> {
    // Publish message to the queue
    await this.rabbitMQClient.sendToQueue(
      this.queueName,
      message,
      this.options
    );
  }
}
```

### 4. Register and Start Consumers

Register your consumers and start consuming:

```typescript
import { RabbitMQConnection } from "rabbitmq-lite";

// Register consumers
RabbitMQConnection.registerConsumers([
  new OrderProcessor(),
  // Add more consumers here
]);

// Connect and start consuming
await RabbitMQConnection.connect("amqp://localhost");
```

### 5. Publish Messages

Use your publisher to send messages:

```typescript
const publisher = new OrderPublisher();

await publisher.publish({
  orderId: "12345",
  customerId: "67890",
  items: ["item1", "item2"],
});
```

## API Reference

### RabbitMQConnection

Static class for managing RabbitMQ connections.

#### Methods

##### `connect(rabbitMQUrl: string, retryOnFail?: boolean): Promise<void>`

Establishes a connection to RabbitMQ server.

- `rabbitMQUrl`: Connection URL (e.g., `'amqp://localhost'`)
- `retryOnFail`: Whether to retry connection on failure (default: `true`)

##### `registerConsumers(consumers: Array<Consumer>): void`

Registers consumers to be started when connection is established.

- `consumers`: Array of consumer instances

##### `getClient(): RabbitMQClient`

Returns the shared RabbitMQ client instance.

##### `isConnected(): boolean`

Checks if the connection is active.

##### `close(): Promise<void>`

Closes the RabbitMQ connection.

##### `reset(): void`

Resets the connection state (useful for testing).

### Consumer

Abstract class for consuming messages from RabbitMQ queues.

#### Constructor

```typescript
constructor(
  queueName: string,
  options?: ConsumerOptions
)
```

**Parameters:**

- `queueName`: Name of the queue to consume from
- `options`: Consumer configuration options
  - `retry` (boolean): Enable retry on error (default: `true`)
  - `retry_count` (number): Maximum retry attempts (default: `3`)
  - `retry_delay` (number): Delay between retries in milliseconds (default: `0`)

#### Methods

##### `execute<MessageType>(message: MessageType): Promise<void>`

Abstract method that must be implemented to process messages.

- `message`: The consumed message

##### `consume(): Promise<void>`

Starts consuming messages from the queue. Automatically handles:

- Message parsing (JSON)
- Error handling and retry logic
- Error queue management
- Message acknowledgment

### Publisher

Abstract class for publishing messages to RabbitMQ queues.

#### Constructor

```typescript
constructor(
  queueName: string,
  options?: object
)
```

**Parameters:**

- `queueName`: Name of the queue to publish to
- `options`: Publishing options (see RabbitMQClient options)

#### Methods

##### `publish<MessageType>(message: MessageType): Promise<void>`

Abstract method that must be implemented to publish messages.

- `message`: The message to publish

#### Protected Properties

- `rabbitMQClient`: Access to the shared RabbitMQ client
- `queueName`: The queue name
- `options`: Publishing options

## Publishing Options

When publishing messages, you can use the following options:

```typescript
{
  exchange?: string;           // Exchange name
  routingKey?: string;         // Routing key
  persistent?: boolean;        // Make message persistent
  delay?: number;              // Delay in milliseconds
  exchangeType?: 'direct' | 'fanout' | 'topic';  // Exchange type
  headers?: object;            // Custom headers
}
```

## Error Handling

### Retry Mechanism

When a consumer's `execute` method throws an error:

1. If `retry` is `false`, the message is acknowledged and discarded
2. If `retry` is `true`:
   - The message is retried up to `retry_count` times
   - Each retry includes a `delay` (if specified)
   - Error count and last exception are stored in message headers
   - After max retries, the message is sent to `{queueName}_error` queue

### Error Queue

Failed messages (after max retries) are automatically sent to an error queue named `{queueName}_error`. You can create a consumer for this queue to handle failed messages:

```typescript
class ErrorHandler extends Consumer {
  constructor() {
    super("order_queue_error", {
      retry: false, // Don't retry error messages
    });
  }

  async execute<OrderMessage>(message: OrderMessage): Promise<void> {
    // Handle failed messages
    console.error("Failed message:", message);
    // Log, notify, or store for manual review
  }
}
```

## Connection Management

### Auto-Reconnection

The library automatically handles connection loss:

- Detects when the connection is lost
- Automatically attempts to reconnect
- Restarts all registered consumers after reconnection

### Manual Connection Management

```typescript
// Check connection status
if (RabbitMQConnection.isConnected()) {
  console.log("Connected!");
}

// Close connection
await RabbitMQConnection.close();
```

## Complete Example

```typescript
import { RabbitMQConnection, Consumer, Publisher } from "rabbitmq-lite";

// Define message types
interface OrderMessage {
  orderId: string;
  customerId: string;
  items: string[];
}

// Create consumer
class OrderConsumer extends Consumer {
  constructor() {
    super("orders", {
      retry: true,
      retry_count: 3,
      retry_delay: 1000,
    });
  }

  async execute(message: OrderMessage): Promise<void> {
    console.log("Processing order:", message.orderId);
    // Your processing logic here
  }
}

// Create publisher
class OrderPublisher extends Publisher {
  constructor() {
    super("orders", { persistent: true });
  }

  async publish(message: OrderMessage): Promise<void> {
    await this.rabbitMQClient.sendToQueue(
      this.queueName,
      message,
      this.options
    );
  }
}

// Initialize
async function init() {
  // Register consumers
  RabbitMQConnection.registerConsumers([new OrderConsumer()]);

  // Connect
  await RabbitMQConnection.connect("amqp://localhost");

  // Publish a message
  const publisher = new OrderPublisher();
  await publisher.publish({
    orderId: "12345",
    customerId: "67890",
    items: ["item1", "item2"],
  });
}

init().catch(console.error);
```

## License

MIT

## Author

Tanzim

## Repository

[GitHub](https://github.com/tDipto/rabbitmq-lite)
