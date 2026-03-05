import { betterAuth } from "better-auth";
import { Polar } from "@polar-sh/sdk";
import { env } from "~/env";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { db } from "~/server/db";
import { prismaAdapter } from "better-auth/adapters/prisma";

const polarClient = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN,
  server: "sandbox",
});

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
  },

  plugins: [
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,
      use: [
        checkout({
          products: [
            {
              productId: "50fbfe76-38bc-469a-a179-4c0f2e22c6e0",
              slug: "small",
            },
            {
              productId: "770272d4-1d29-4a24-8a76-2bbb37b58dd3",
              slug: "medium",
            },
            {
              productId: "6ad4267f-dd20-4e16-9010-3c5352fdf4bd",
              slug: "large",
            },
          ],
          successUrl: "/dashboard",
          authenticatedUsersOnly: true,
        }),

        portal(),

        webhooks({
          secret: env.POLAR_WEBHOOK_SECRET,

          onOrderPaid: async (order) => {
            console.log("Order paid webhook received:", order.data.id);
            const externalCustomerId = order.data.customer.externalId;

            if (!externalCustomerId) {
              console.error(
                "No external customer id found for order:",
                order.data.id,
              );
              throw new Error("No external customer id found.");
            }

            let creditsToAdd = 0;

            // Updated product IDs to match the ones in checkout configuration
            switch (order.data.productId) {
              case "50fbfe76-38bc-469a-a179-4c0f2e22c6e0": // small
                creditsToAdd = 50;
                break;
              case "770272d4-1d29-4a24-8a76-2bbb37b58dd3": // medium
                creditsToAdd = 200;
                break;
              case "6ad4267f-dd20-4e16-9010-3c5352fdf4bd": // large
                creditsToAdd = 400;
                break;
              default:
                console.error("Unknown product ID paid:", order.data.productId);
            }

            if (creditsToAdd > 0) {
              console.log(
                `Adding ${creditsToAdd} credits to user ${externalCustomerId}`,
              );
              await db.user.update({
                where: { id: externalCustomerId },
                data: {
                  credits: { increment: creditsToAdd },
                },
              });
              console.log(
                `Successfully added credits to user ${externalCustomerId}`,
              );
            }
          },
        }),
      ],
    }),
  ],
});
