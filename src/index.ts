import { serve } from "@hono/node-server";
 import { Hono } from "hono";
 import prismaClient from "./prisma.js";
 
 const app = new Hono();
 
 app.get("/", (c) => {
   return c.text("Hello Hono!");
 });
 
 // 1. Customers
 // POST /customers → Register a new customer
 // GET /customers/top → Get the top 5 customers based on the number of orders placed
 app.get("/customers/top", async (context) => {
   // Aggregate orders by customer and count the number of orders placed by each customer
   const topCustomers = await prismaClient.order.groupBy({
     by: ["customerId"], // Group by customerId to count the orders for each customer
     _count: {
       id: true, // Count the number of orders for each customer
     },
     orderBy: {
       _count: {
         id: "desc", // Order by the number of orders in descending order (top customers first)
       },
     },
     take: 5, // Limit the result to the top 5 customers
   });
 
   // If there are any top customers, fetch their full details
   if (topCustomers.length > 0) {
     const customerIds = topCustomers.map((customer: { customerId: string }) => customer.customerId);
 
     const customers = await prismaClient.customer.findMany({
       where: {
         id: {
           in: customerIds, // Fetch customers whose ids are in the top customers list
         },
       },
     });
 
     // Combine the aggregated order count with the customer details
     const result = topCustomers.map((topCustomer: { customerId: string; _count: { id: number } }) => {
       const customer = customers.find((c: { id: string }) => c.id === topCustomer.customerId);
       return {
         customer,
         orderCount: topCustomer._count.id, // Include the count of orders for this customer
       };
     });
 
     return context.json(result, 200);
   }
 
   // If no top customers found, return an empty response
   return context.json({ message: "No customers found" }, 200);
 });
 app.post("/customers", async (context) => {
   const { name, email, phoneNumber, address } = await context.req.json();
 
 
   return context.json({ message: "No items found" }, 200);
 });
 
 // GET /customers/top → Get the top 5 customers based on the number of orders placed
 
 serve(
   {
     fetch: app.fetch,
     port: 3000,
   },
   (info) => {
     console.log(`Server is running on http://localhost:${info.port}`);
   }
 );