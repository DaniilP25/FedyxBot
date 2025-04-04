import { getCollection } from './collection';

export async function saveData(data: any) {
  const collection = await getCollection();
  await collection.insertOne(data);
}

export async function loadData() {
  const collection = await getCollection();
  const data = await collection.find().toArray();
  return data;
}