import { db } from '../database/postgres';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number;
  sku: string;
  category: string;
  tags: string[];
  images: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryAlert {
  productId: string;
  productName: string;
  currentStock: number;
  threshold: number;
}

export async function getProduct(productId: string): Promise<Product | null> {
  const result = await db.query('SELECT * FROM products WHERE id = $1', [productId]);

  if (!result.rows[0]) {
    return null;
  }

  return mapProduct(result.rows[0]);
}

export async function getProducts(
  options: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    active?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Product[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramCount = 1;

  if (options.category) {
    conditions.push(`category = $${paramCount++}`);
    params.push(options.category);
  }

  if (options.minPrice !== undefined) {
    conditions.push(`price >= $${paramCount++}`);
    params.push(options.minPrice);
  }

  if (options.maxPrice !== undefined) {
    conditions.push(`price <= $${paramCount++}`);
    params.push(options.maxPrice);
  }

  if (options.inStock) {
    conditions.push('stock > 0');
  }

  if (options.active !== undefined) {
    conditions.push(`active = $${paramCount++}`);
    params.push(options.active);
  }

  let query = 'SELECT * FROM products';
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  if (options.limit) {
    query += ` LIMIT $${paramCount++}`;
    params.push(options.limit);
  }

  if (options.offset) {
    query += ` OFFSET $${paramCount++}`;
    params.push(options.offset);
  }

  const result = await db.query(query, params);

  return result.rows.map(mapProduct);
}

export async function updateStock(
  productId: string,
  quantity: number,
  operation: 'add' | 'subtract' = 'subtract'
): Promise<{ success: boolean; newStock?: number; error?: string }> {
  try {
    const current = await db.query('SELECT stock FROM products WHERE id = $1', [productId]);

    if (!current.rows[0]) {
      return { success: false, error: 'Product not found' };
    }

    const newStock =
      operation === 'add'
        ? current.rows[0].stock + quantity
        : current.rows[0].stock - quantity;

    if (newStock < 0) {
      return { success: false, error: 'Insufficient stock' };
    }

    await db.query('UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2', [
      newStock,
      productId
    ]);

    if (newStock <= 10) {
      await checkLowStockAlert(productId);
    }

    return { success: true, newStock };
  } catch (err) {
    return { success: false, error: 'Failed to update stock' };
  }
}

export async function deductInventory(
  items: { productId: string; quantity: number }[]
): Promise<{ success: boolean; error?: string }> {
  for (const item of items) {
    const result = await updateStock(item.productId, item.quantity, 'subtract');
    if (!result.success) {
      return { success: false, error: result.error };
    }
  }

  return { success: true };
}

export async function checkLowStockAlert(productId: string): Promise<void> {
  const product = await db.query(
    'SELECT id, name, stock FROM products WHERE id = $1',
    [productId]
  );

  if (!product.rows[0] || product.rows[0].stock > 10) return;

  await db.query(
    `INSERT INTO inventory_alerts (product_id, current_stock, threshold, created_at)
     VALUES ($1, $2, 10, NOW())`,
    [productId, product.rows[0].stock]
  );
}

export async function getLowStockProducts(threshold = 10): Promise<InventoryAlert[]> {
  const result = await db.query(
    'SELECT id, name, stock FROM products WHERE stock <= $1 AND active = true',
    [threshold]
  );

  return result.rows.map(row => ({
    productId: row.id,
    productName: row.name,
    currentStock: row.stock,
    threshold
  }));
}

export async function getInventoryValuation(): Promise<{
  totalValue: number;
  productCount: number;
  outOfStockCount: number;
}> {
  const result = await db.query(
    `SELECT
       COALESCE(SUM(price * stock), 0) as total_value,
       COUNT(*) as product_count,
       COUNT(*) FILTER (WHERE stock = 0) as out_of_stock
     FROM products WHERE active = true`
  );

  return {
    totalValue: parseFloat(result.rows[0].total_value),
    productCount: parseInt(result.rows[0].product_count),
    outOfStockCount: parseInt(result.rows[0].out_of_stock)
  };
}

export async function searchProducts(
  query: string,
  limit = 20
): Promise<Product[]> {
  const result = await db.query(
    `SELECT * FROM products
     WHERE active = true
     AND (
       name ILIKE $1
       OR description ILIKE $1
       OR sku ILIKE $1
       OR $2 = ANY(tags)
     )
     ORDER BY name
     LIMIT $3`,
    [`%${query}%`, query, limit]
  );

  return result.rows.map(mapProduct);
}

function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: parseFloat(row.price),
    currency: row.currency || 'USD',
    stock: row.stock,
    sku: row.sku,
    category: row.category,
    tags: row.tags || [],
    images: row.images || [],
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
