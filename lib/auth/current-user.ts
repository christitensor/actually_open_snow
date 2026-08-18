import { cookies } from "next/headers";
import { getUserBySessionToken, type User } from "@/lib/db/users";
import { SESSION_COOKIE } from "./cookie";

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getUserBySessionToken(token) : null;
}
