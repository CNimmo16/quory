import { expandDatabaseRecipe, type DatabaseRecipe } from "./database";
export const exampleProducts = [
  {
    id: "shop",
    label: "An online shop",
    description: "An online shop selling coffee and brewing equipment",
    icon: "shop",
  },
  {
    id: "saas",
    label: "A subscription app",
    description: "A SaaS app with teams, subscriptions and monthly billing",
    icon: "saas",
  },
  {
    id: "projects",
    label: "A project tool",
    description: "A project management tool with projects, tasks and comments",
    icon: "projects",
  },
] as const;
const customers: DatabaseRecipe["tables"][number] = {
  name: "customers",
  columns: [
    ["name", "name"],
    ["email", "email"],
    ["region", ["UK", "US", "EU"]],
  ],
};
export const exampleRecipes: Record<string, DatabaseRecipe> = {
  shop: {
    tables: [
      customers,
      {
        name: "products",
        columns: [
          ["name", ["House blend coffee", "Ceramic dripper", "Hand grinder"]],
          ["price", 24],
          ["stock", 40],
        ],
      },
      {
        name: "orders",
        columns: [
          ["customer_id", "@customers"],
          ["status", ["delivered", "delayed", "processing"]],
          ["total", 42],
        ],
      },
      {
        name: "order_items",
        columns: [
          ["order_id", "@orders"],
          ["product_id", "@products"],
          ["quantity", 1],
        ],
      },
      {
        name: "payments",
        columns: [
          ["order_id", "@orders"],
          ["amount", 42],
          ["status", ["paid", "pending", "failed"]],
          ["paid", false],
        ],
      },
      {
        name: "shipments",
        columns: [
          ["order_id", "@orders"],
          ["status", ["delivered", "delayed", "in_transit"]],
          ["carrier", ["DHL", "Royal Mail", "UPS"]],
        ],
      },
      {
        name: "tickets",
        columns: [
          ["order_id", "@orders"],
          ["customer_id", "@customers"],
          ["status", ["open", "resolved", "pending"]],
        ],
      },
      {
        name: "ticket_messages",
        columns: [
          ["ticket_id", "@tickets"],
          ["customer_id", "@customers"],
          [
            "body",
            [
              "My order has not arrived.",
              "We are investigating the delay.",
              "Thanks for the update.",
            ],
          ],
        ],
      },
    ],
  },
  saas: {
    tables: [
      {
        name: "organizations",
        columns: [
          ["name", ["Northstar Studio", "Willow Labs", "Cedar Digital"]],
          ["region", ["UK", "US", "EU"]],
          ["industry", ["Design", "Software", "Consulting"]],
        ],
      },
      {
        name: "customers",
        columns: [...customers.columns, ["organization_id", "@organizations"]],
      },
      {
        name: "plans",
        columns: [
          ["name", ["Starter", "Team", "Business"]],
          ["monthly_price", 49],
          ["seat_limit", 5],
        ],
      },
      {
        name: "subscriptions",
        columns: [
          ["customer_id", "@customers"],
          ["plan_id", "@plans"],
          ["status", ["active", "past_due", "cancelled"]],
        ],
      },
      {
        name: "invoices",
        columns: [
          ["subscription_id", "@subscriptions"],
          ["amount", 49],
          ["status", ["paid", "overdue", "pending"]],
          ["due_at", "date"],
        ],
      },
      {
        name: "payments",
        columns: [
          ["invoice_id", "@invoices"],
          ["amount", 49],
          ["status", ["paid", "failed", "pending"]],
        ],
      },
      {
        name: "tickets",
        columns: [
          ["invoice_id", "@invoices"],
          ["customer_id", "@customers"],
          ["status", ["open", "resolved", "pending"]],
        ],
      },
      {
        name: "ticket_messages",
        columns: [
          ["ticket_id", "@tickets"],
          ["author_id", "@customers"],
          [
            "body",
            [
              "The renewal payment failed.",
              "We have updated the billing details.",
              "The payment has gone through.",
            ],
          ],
        ],
      },
    ],
  },
  projects: {
    tables: [
      customers,
      {
        name: "teams",
        columns: [
          ["name", ["Engineering", "Design", "Customer Success"]],
          ["region", ["UK", "US", "EU"]],
          ["status", ["active", "archived"]],
        ],
      },
      {
        name: "memberships",
        columns: [
          ["team_id", "@teams"],
          ["customer_id", "@customers"],
          ["role", ["owner", "editor", "viewer"]],
        ],
      },
      {
        name: "projects",
        columns: [
          ["team_id", "@teams"],
          ["name", ["Website refresh", "Mobile launch", "Customer onboarding"]],
          ["status", ["active", "paused", "complete"]],
        ],
      },
      {
        name: "tasks",
        columns: [
          ["project_id", "@projects"],
          ["assignee_id", "@customers"],
          [
            "title",
            ["Review designs", "Fix checkout bug", "Write launch notes"],
          ],
          ["status", ["todo", "blocked", "done"]],
        ],
      },
      {
        name: "comments",
        columns: [
          ["task_id", "@tasks"],
          ["author_id", "@customers"],
          [
            "body",
            [
              "Ready for review.",
              "Waiting on customer feedback.",
              "Reproduced the issue; investigating.",
            ],
          ],
        ],
      },
      {
        name: "attachments",
        columns: [
          ["task_id", "@tasks"],
          ["name", ["designs.pdf", "screenshot.png", "launch-notes.txt"]],
          ["size_bytes", 2048],
        ],
      },
      {
        name: "activity_events",
        columns: [
          ["task_id", "@tasks"],
          ["actor_id", "@customers"],
          ["action", ["created", "assigned", "updated"]],
        ],
      },
    ],
  },
};
export function examplePlan(id: string) {
  return expandDatabaseRecipe(exampleRecipes[id] ?? exampleRecipes.projects);
}
