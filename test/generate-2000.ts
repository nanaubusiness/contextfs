#!/usr/bin/env node

/**
 * Generate 2,000 realistic production code files for testing ContextFS
 *
 * Creates mock TypeScript files across 7 service types:
 * - Auth Service (login, register, password reset, email verification)
 * - Payment Service (payment intents, refunds, Stripe integration)
 * - User Profile (avatar upload, address management, social links)
 * - Order Service (order creation, fulfillment, shipping, cancellation)
 * - Notification Service (push, email, SMS delivery)
 * - Analytics (event tracking, user metrics, revenue, retention)
 * - Inventory (stock management, low stock alerts, valuation)
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "mock-project2000-real");

// Service definitions
const SERVICES = [
  {
    name: "auth",
    functions: [
      { name: "login", params: ["email", "password"], risk: "high" },
      { name: "register", params: ["email", "password", "name"], risk: "high" },
      { name: "logout", params: ["userId", "sessionId"], risk: "medium" },
      { name: "verifyToken", params: ["token"], risk: "high" },
      { name: "refreshSession", params: ["refreshToken"], risk: "medium" },
      { name: "resetPassword", params: ["email"], risk: "high" },
      { name: "changePassword", params: ["userId", "oldPassword", "newPassword"], risk: "high" },
      { name: "verifyEmail", params: ["token"], risk: "medium" },
      { name: "sendVerificationEmail", params: ["email"], risk: "low" },
      { name: "validateSession", params: ["sessionId"], risk: "medium" },
      { name: "invalidateSession", params: ["sessionId"], risk: "medium" },
      { name: "getUserById", params: ["userId"], risk: "low" },
      { name: "updateUserProfile", params: ["userId", "updates"], risk: "medium" },
      { name: "deleteAccount", params: ["userId", "password"], risk: "high" },
      { name: "listSessions", params: ["userId"], risk: "low" },
    ],
  },
  {
    name: "payment",
    functions: [
      { name: "createPaymentIntent", params: ["amount", "currency", "customerId"], risk: "high" },
      { name: "confirmPayment", params: ["paymentIntentId"], risk: "high" },
      { name: "cancelPayment", params: ["paymentIntentId"], risk: "high" },
      { name: "refundPayment", params: ["paymentId", "amount"], risk: "high" },
      { name: "getPaymentById", params: ["paymentId"], risk: "low" },
      { name: "listPayments", params: ["customerId", "limit"], risk: "low" },
      { name: "createSubscription", params: ["customerId", "planId"], risk: "high" },
      { name: "cancelSubscription", params: ["subscriptionId"], risk: "high" },
      { name: "updateSubscription", params: ["subscriptionId", "updates"], risk: "medium" },
      { name: "getInvoice", params: ["invoiceId"], risk: "low" },
      { name: "listInvoices", params: ["customerId"], risk: "low" },
      { name: "createCustomer", params: ["email", "name"], risk: "medium" },
      { name: "updateCustomer", params: ["customerId", "updates"], risk: "medium" },
      { name: "deleteCustomer", params: ["customerId"], risk: "high" },
      { name: "getPaymentMethods", params: ["customerId"], risk: "low" },
    ],
  },
  {
    name: "userProfile",
    functions: [
      { name: "getProfile", params: ["userId"], risk: "low" },
      { name: "updateProfile", params: ["userId", "updates"], risk: "medium" },
      { name: "uploadAvatar", params: ["userId", "file"], risk: "medium" },
      { name: "deleteAvatar", params: ["userId"], risk: "low" },
      { name: "addAddress", params: ["userId", "address"], risk: "medium" },
      { name: "updateAddress", params: ["addressId", "updates"], risk: "medium" },
      { name: "deleteAddress", params: ["addressId"], risk: "medium" },
      { name: "listAddresses", params: ["userId"], risk: "low" },
      { name: "addSocialLink", params: ["userId", "platform", "url"], risk: "low" },
      { name: "removeSocialLink", params: ["userId", "platform"], risk: "low" },
      { name: "getSocialLinks", params: ["userId"], risk: "low" },
      { name: "updatePreferences", params: ["userId", "preferences"], risk: "medium" },
      { name: "getPreferences", params: ["userId"], risk: "low" },
      { name: "verifyPhone", params: ["userId", "code"], risk: "medium" },
      { name: "sendPhoneVerification", params: ["userId", "phone"], risk: "low" },
    ],
  },
  {
    name: "order",
    functions: [
      { name: "createOrder", params: ["customerId", "items"], risk: "high" },
      { name: "getOrder", params: ["orderId"], risk: "low" },
      { name: "updateOrderStatus", params: ["orderId", "status"], risk: "high" },
      { name: "cancelOrder", params: ["orderId", "reason"], risk: "high" },
      { name: "listOrders", params: ["customerId", "status"], risk: "low" },
      { name: "fulfillOrder", params: ["orderId"], risk: "high" },
      { name: "shipOrder", params: ["orderId", "trackingNumber"], risk: "medium" },
      { name: "deliverOrder", params: ["orderId"], risk: "medium" },
      { name: "returnOrder", params: ["orderId", "reason"], risk: "high" },
      { name: "refundOrder", params: ["orderId"], risk: "high" },
      { name: "getOrderItems", params: ["orderId"], risk: "low" },
      { name: "addOrderItem", params: ["orderId", "item"], risk: "medium" },
      { name: "removeOrderItem", params: ["orderId", "itemId"], risk: "medium" },
      { name: "applyDiscount", params: ["orderId", "discountCode"], risk: "medium" },
      { name: "calculateTotal", params: ["orderId"], risk: "low" },
    ],
  },
  {
    name: "notification",
    functions: [
      { name: "sendPush", params: ["userId", "title", "body"], risk: "medium" },
      { name: "sendEmail", params: ["to", "subject", "body"], risk: "medium" },
      { name: "sendSMS", params: ["phone", "message"], risk: "medium" },
      { name: "scheduleNotification", params: ["userId", "notification", "scheduledAt"], risk: "medium" },
      { name: "cancelNotification", params: ["notificationId"], risk: "low" },
      { name: "listNotifications", params: ["userId"], risk: "low" },
      { name: "markAsRead", params: ["notificationId"], risk: "low" },
      { name: "markAllAsRead", params: ["userId"], risk: "low" },
      { name: "deleteNotification", params: ["notificationId"], risk: "low" },
      { name: "getNotificationSettings", params: ["userId"], risk: "low" },
      { name: "updateNotificationSettings", params: ["userId", "settings"], risk: "medium" },
      { name: "sendBulkNotification", params: ["userIds", "notification"], risk: "high" },
      { name: "sendTemplateEmail", params: ["to", "templateId", "data"], risk: "medium" },
      { name: "createTemplate", params: ["template"], risk: "low" },
      { name: "deleteTemplate", params: ["templateId"], risk: "low" },
    ],
  },
  {
    name: "analytics",
    functions: [
      { name: "trackEvent", params: ["userId", "event", "properties"], risk: "low" },
      { name: "getUserMetrics", params: ["userId", "dateRange"], risk: "low" },
      { name: "getRevenueMetrics", params: ["dateRange"], risk: "low" },
      { name: "getConversionRate", params: ["funnelId", "dateRange"], risk: "low" },
      { name: "getRetentionRate", params: ["cohortDate", "period"], risk: "low" },
      { name: "getActiveUsers", params: ["dateRange"], risk: "low" },
      { name: "getSessionMetrics", params: ["userId"], risk: "low" },
      { name: "getFunnelAnalytics", params: ["funnelId", "dateRange"], risk: "low" },
      { name: "getPageViews", params: ["page", "dateRange"], risk: "low" },
      { name: "getBounceRate", params: ["dateRange"], risk: "low" },
      { name: "getAverageSessionDuration", params: ["dateRange"], risk: "low" },
      { name: "getTopPages", params: ["dateRange", "limit"], risk: "low" },
      { name: "getUserSegments", params: ["criteria"], risk: "medium" },
      { name: "createSegment", params: ["name", "criteria"], risk: "medium" },
      { name: "deleteSegment", params: ["segmentId"], risk: "medium" },
    ],
  },
  {
    name: "inventory",
    functions: [
      { name: "checkStock", params: ["productId"], risk: "low" },
      { name: "reserveStock", params: ["productId", "quantity"], risk: "high" },
      { name: "releaseStock", params: ["reservationId"], risk: "medium" },
      { name: "getLowStockAlerts", params: [], risk: "low" },
      { name: "updateStock", params: ["productId", "quantity"], risk: "high" },
      { name: "getStockLevel", params: ["productId"], risk: "low" },
      { name: "listProducts", params: ["filters"], risk: "low" },
      { name: "getProduct", params: ["productId"], risk: "low" },
      { name: "createProduct", params: ["product"], risk: "high" },
      { name: "updateProduct", params: ["productId", "updates"], risk: "high" },
      { name: "deleteProduct", params: ["productId"], risk: "high" },
      { name: "getInventoryValuation", params: ["date"], risk: "low" },
      { name: "reorderStock", params: ["productId", "quantity"], risk: "medium" },
      { name: "getReorderAlerts", params: [], risk: "low" },
      { name: "adjustStock", params: ["productId", "adjustment", "reason"], risk: "high" },
    ],
  },
];

// Dependencies per service
const DEPENDENCIES = {
  auth: ["bcrypt", "jsonwebtoken", "./db/user.repository", "./db/session.repository"],
  payment: ["stripe", "./db/payment.repository", "./db/customer.repository"],
  userProfile: ["./db/user.repository", "./services/storage.service"],
  order: ["./db/order.repository", "./services/inventory.service", "./services/payment.service"],
  notification: ["./providers/push", "./providers/email", "./providers/sms"],
  analytics: ["./db/analytics.repository", "./services/event-tracker"],
  inventory: ["./db/inventory.repository", "./services/notification.service"],
};

// Risk level comments
const RISK_COMMENTS = {
  high: "CRITICAL: Contains sensitive data or financial operations",
  medium: "Standard data processing operation",
  low: "Read-only or low-impact operation",
};

// Generate a single file
function generateFile(service: string, index: number, func: { name: string; params: string[]; risk: string }): string {
  const id = String(index).padStart(4, "0");
  const deps = DEPENDENCIES[service as keyof typeof DEPENDENCIES] || ["./db/repository"];

  // Generate varied line counts for realistic file sizes
  const lineCount = 40 + Math.floor(Math.random() * 60);
  const lines: string[] = [];

  lines.push(`import { ${deps.map(d => {
    if (d.startsWith(".")) {
      const parts = d.replace("./", "").split("/");
      return parts[parts.length - 1].replace(".repository", "Repo").replace(".service", "Service");
    }
    return d.replace(/[^a-zA-Z0-9]/g, "");
  }).join(", ")} } from '${deps[0]}';`);
  lines.push("");
  lines.push(`/**`);
  lines.push(` * ${service}-${id}.ts`);
  lines.push(` * ${service.charAt(0).toUpperCase() + service.slice(1)} service - ${func.name} operation`);
  lines.push(` * Risk: ${func.risk.toUpperCase()}`);
  lines.push(` */`);
  lines.push("");
  lines.push(`// Types`);
  lines.push(`interface ${service.charAt(0).toUpperCase() + service.slice(1)}Options {`);
  lines.push(`  timeout?: number;`);
  lines.push(`  retries?: number;`);
  lines.push(`  metadata?: Record<string, unknown>;`);
  lines.push(`}`);
  lines.push("");
  lines.push(`interface ${service.charAt(0).toUpperCase() + service.slice(1)}Result {`);
  lines.push(`  success: boolean;`);
  lines.push(`  data?: unknown;`);
  lines.push(`  error?: string;`);
  lines.push(`  timestamp: Date;`);
  lines.push(`}`);
  lines.push("");
  lines.push(`// Configuration`);
  lines.push(`const DEFAULT_TIMEOUT = ${10000 + Math.floor(Math.random() * 40000)};`);
  lines.push(`const MAX_RETRIES = ${1 + Math.floor(Math.random() * 4)};`);
  lines.push(`const API_VERSION = '${Math.random().toString(36).substring(7)}';`);
  lines.push("");

  // Main function
  lines.push(`/**`);
  lines.push(` * ${func.name}`);
  lines.push(` * @param params Function parameters`);
  lines.push(` * @returns Promise<${service.charAt(0).toUpperCase() + service.slice(1)}Result>`);
  lines.push(` */`);
  lines.push(`export async function ${func.name}(`);
  lines.push(`  ${func.params.map(p => `${p}: unknown`).join(",\n  ")}`);
  lines.push(`): Promise<${service.charAt(0).toUpperCase() + service.slice(1)}Result> {`);
  lines.push(`  const startTime = Date.now();`);
  lines.push(`  const requestId = '${func.name}-${Date.now()}-${Math.random().toString(36).substring(7)}';`);
  lines.push("");
  lines.push(`  // Validation`);
  lines.push(`  if (!validate${func.name.charAt(0).toUpperCase() + func.name.slice(1)}Params(${func.params.join(", ")})) {`);
  lines.push(`    return {`);
  lines.push(`      success: false,`);
  lines.push(`      error: 'Invalid parameters provided',`);
  lines.push(`      timestamp: new Date(),`);
  lines.push(`    };`);
  lines.push(`  }`);
  lines.push("");

  // Add some business logic lines
  for (let i = 0; i < 15; i++) {
    lines.push(`  // Processing step ${i + 1}`);
    lines.push(`  await new Promise(resolve => setTimeout(resolve, ${1 + Math.floor(Math.random() * 10)}));`);
  }
  lines.push("");

  lines.push(`  // Execute ${func.name}`);
  lines.push(`  try {`);
  lines.push(`    const result = await ${func.name.charAt(0).toUpperCase() + func.name.slice(1)}Internal(${func.params.join(", ")});`);
  lines.push(`    return {`);
  lines.push(`      success: true,`);
  lines.push(`      data: result,`);
  lines.push(`      timestamp: new Date(),`);
  lines.push(`    };`);
  lines.push(`  } catch (error) {`);
  lines.push(`    return {`);
  lines.push(`      success: false,`);
  lines.push(`      error: error instanceof Error ? error.message : 'Unknown error',`);
  lines.push(`      timestamp: new Date(),`);
  lines.push(`    };`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push("");

  // Helper function
  lines.push(`function validate${func.name.charAt(0).toUpperCase() + func.name.slice(1)}Params(${func.params.join(", ")}) {`);
  lines.push(`  return true;`);
  lines.push(`}`);
  lines.push("");
  lines.push(`async function ${func.name.charAt(0).toUpperCase() + func.name.slice(1)}Internal(${func.params.join(", ")}) {`);
  lines.push(`  // Internal implementation`);
  lines.push(`  return { id: '${func.name}-result', status: 'completed' };`);
  lines.push(`}`);

  return lines.join("\n");
}

// Main generation
async function main() {
  console.log("Generating 2,000 mock production code files...\n");

  // Clean up existing directory
  try {
    await fs.rm(OUTPUT_DIR, { recursive: true });
  } catch {
    // Directory doesn't exist
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let fileCount = 0;
  const filesPerService = Math.floor(2000 / SERVICES.length);

  for (const service of SERVICES) {
    console.log(`Generating ${service.name} files...`);

    for (let i = 0; i < filesPerService; i++) {
      const func = service.functions[i % service.functions.length];
      const content = generateFile(service.name, fileCount, func);
      const filename = `${service.name}-${String(fileCount).padStart(4, "0")}.ts`;
      await fs.writeFile(path.join(OUTPUT_DIR, filename), content);
      fileCount++;

      if (fileCount % 100 === 0) {
        console.log(`  Generated ${fileCount}/2000 files...`);
      }
    }
  }

  console.log(`\nDone! Generated ${fileCount} files in ${OUTPUT_DIR}`);
}

main().catch(console.error);
