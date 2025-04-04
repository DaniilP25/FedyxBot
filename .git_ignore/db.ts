import { MongoClient } from 'mongodb';

const url = 'mongodb://localhost:27017';
const dbName = 'mydatabase';

export async function connect() {
  const client = new MongoClient(url);
  try {
    await client.connect();
    console.log('Connected successfully to MongoDB');
    return client;
  } catch (error) {
    console.error('Connection failed:', error);
    throw error;
  }
}

export async function disconnect(client: MongoClient) {
  await client.close();
  console.log('Disconnected from MongoDB');
}