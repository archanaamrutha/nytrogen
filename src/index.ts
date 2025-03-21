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
    const customerIds = topCustomers.map((customer) => customer.customerId);

    const customers = await prismaClient.customer.findMany({
      where: {
        id: {
          in: customerIds, // Fetch customers whose ids are in the top customers list
        },
      },
    });

    // Combine the aggregated order count with the customer details
    const result = topCustomers.map((topCustomer) => {
      const customer = customers.find((c) => c.id === topCustomer.customerId);
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

  const customers = await prismaClient.customer.create({
    data: {
      name,
      email,
      phoneNumber,
      address,
    },
  });
  return context.json(customers, 200);
});

// GET /customers/{id} → Retrieve details of a customer
app.get("/customers/:id", async (context) => {
  const id = context.req.param("id");
  const customers = await prismaClient.customer.findUnique({
    where: {
      id: id,
    },
  });

  if (!customers)
    return context.json({ message: "Customer with given id not found" }, 404);

  return context.json(customers, 200);
});
// GET /customers/{id}/orders → Retrieve all orders placed by this customer
app.get("/customers/:id/orders", async (context) => {
  const id = await context.req.param("id");
  const customer = await prismaClient.customer.findUnique({
    where: {
      id: id,
    },
  });

  if (!customer) {
    return context.json({ message: "Customer with given id not found" }, 404);
  }

  const customerorder = await prismaClient.order.findMany({
    where: {
      customerId: id,
    },
  });

  if (!customerorder) {
    return context.json(
      { message: "Cutomer with given id did not order anything" },
      404
    );
  }

  return context.json(customerorder, 200);
});

// Restaurants
// POST /restaurants → Register a new restaurant
app.post("/restaurants", async (context) => {
  const { name, location } = await context.req.json();

  const restaurants = await prismaClient.restaurant.create({
    data: {
      name,
      location,
    },
  });
  return context.json(restaurants, 200);
});

// GET /restaurants/{id}/menu → Get all available menu items from a restaurant
app.get("/restaurants/:id/menu", async (context) => {
  const id = await context.req.param("id");
  const restaurant = await prismaClient.restaurant.findUnique({
    where: {
      id: id,
    },
  });
  if (!restaurant) {
    return context.json({ message: "Restaurant with given id not found" }, 404);
  }

  const menu = await prismaClient.menuItem.findMany({
    where: {
      restaurantId: id,
    },
  });
  return context.json(menu, 200);
});

// Menu Items
// POST /restaurants/{id}/menu → Add a menu item to a restaurant
app.post("/restaurants/:id/menu", async (context) => {
  const id = await context.req.param("id");
  const { name, price, isAvailable } = await context.req.json();
  const restaurant = await prismaClient.restaurant.findUnique({
    where: {
      id: id,
    },
  });
  if (!restaurant) {
    return context.json(
      {
        message: "The resturant with given id is not present",
      },
      404
    );
  }
  const newmenu = await prismaClient.menuItem.create({
    data: {
      name,
      price,
      isAvailable,
      restaurantId: id,
    },
  });
  return context.json(newmenu, 200);
});

// PATCH /menu/{id} → Update availability or price of a menu item
app.patch("/menu/:id", async (context) => {
  const id = await context.req.param("id");
  const { price, isAvailable } = await context.req.json();
  const menuexists = await prismaClient.menuItem.findUnique({
    where: {
      id: id,
    },
  });

  if (!menuexists) {
    return context.json({ messge: "Menu with given Id does not exists" }, 404);
  }

  const updatedmenu = await prismaClient.menuItem.update({
    where: {
      id: id,
    },
    data: {
      price: price,
      isAvailable: isAvailable,
    },
  });
  return context.json(updatedmenu, 200);
});

// Orders
// POST /orders → Place an order (includes items and quantities)
app.post("/orders", async (context) => {
  const { customerId, restaurantId, orderItems } = await context.req.json();
  const customer = await prismaClient.customer.findUnique({
    where: {
      id: customerId,
    },
  });
  if (!customer) {
    return context.json({ message: "Customer with given id not found" }, 404);
  }
  const restaurant = await prismaClient.restaurant.findUnique({
    where: {
      id: restaurantId,
    },
  });
  if (!restaurant) {
    return context.json(
      {
        message: "The resturant with given id is not present",
      },
      404
    );
  }

  let totalPrice = 0;
  for (const item of orderItems) {
    const menuItem = await prismaClient.menuItem.findUnique({
      where: {
        id: item.menuItemId,
      },
    });
    if (!menuItem || !menuItem.isAvailable) {
      return context.json(
        { message: "Menu with given id is not present" },
        404
      );
    }
    totalPrice += Number(menuItem.price) * item.quantity;
  }
  const order = await prismaClient.order.create({
    data: {
      customerId,
      restaurantId,
      totalPrice,
      orderItems: {
        create: orderItems.map(
          (item: { menuItemId: string; quantity: number }) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
          })
        ),
      },
    },
  });
  return context.json(order, 200);
});
// GET /orders/{id} → Retrieve details of a specific order

app.get("/orders/:id", async (context) => {
  const id = await context.req.param("id");

  const order = await prismaClient.order.findUnique({
    where: {
      id: id,
    },
  });

  if (!order) {
    return context.json({ message: "Order with given id is not found" }, 404);
  }

  return context.json(order, 200);
});
// PATCH /orders/{id}/status → Update the status of an order (e.g., from Placed to Preparing)
app.patch("/orders/:id/status", async (context) => {
  const id = await context.req.param("id");
  const { status } = await context.req.json();

  const order = await prismaClient.order.findUnique({
    where: {
      id: id,
    },
  });

  const updatedorder = await prismaClient.order.update({
    where: {
      id: id,
    },
    data: {
      status: status,
    },
  });

  return context.json(updatedorder, 200);
});

// Reports & Insights
// GET /restaurants/{id}/revenue → Get total revenue generated by a restaurant

app.get("/restaurants/:id/revenue", async (context) => {
  const id = await context.req.param("id");

  const total = await prismaClient.order.aggregate({
    _sum: {
      totalPrice: true,
    },
    where: {
      restaurantId: id,
      status: {
        not: "Cancelled",
      },
    },
  });

  return context.json(
    { message: "total price:", Number: total._sum.totalPrice },
    200
  );
});
// GET /menu/top-items → Retrieve the most ordered menu item across all restaurants
app.get("/menu/top-items", async (context) => {
  // Aggregate the total quantity of each menu item ordered
  const topMenuItem = await prismaClient.orderItem.groupBy({
    by: ["menuItemId"], // Group by menuItemId to count the orders for each menu item
    _sum: {
      quantity: true, // Sum the quantity of each menu item ordered
    },
    orderBy: {
      _sum: {
        quantity: "desc", // Order by the sum of quantities in descending order (most ordered first)
      },
    },
    take: 1, // Limit the result to just the top item
  });

  // If a top item exists, fetch the corresponding menu item details
  if (topMenuItem.length > 0) {
    const menuItemId = topMenuItem[0].menuItemId;

    const topItem = await prismaClient.menuItem.findUnique({
      where: {
        id: menuItemId,
      },
    });

    return context.json(topItem, 200);
  }

  // If no menu items found, return an empty response
  return context.json({ message: "No items found" }, 200);
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);