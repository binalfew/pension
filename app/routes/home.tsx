import prisma from "~/lib/prisma";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const contributions = await prisma.contributions.findMany({
    take: 10,
    orderBy: {
      ID: "desc",
    },
    include: {
      ContributionType: true,
    },
  });
  return { message: context.VALUE_FROM_EXPRESS, contributions };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { contributions } = loaderData;

  return (
    <div>
      <h1>Contributions</h1>
      <ul>
        {contributions.map((contribution) => (
          <li key={contribution.ID}>
            {contribution.ID} -{" "}
            {contribution.ContributionType?.ContributionTypeName ?? "Unknown"}
          </li>
        ))}
      </ul>
    </div>
  );
}
