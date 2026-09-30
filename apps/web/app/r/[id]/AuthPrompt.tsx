import { buttonVariants } from "@heroui/react";

type Props = {
  marketingUrl: string;
  loginUrl: string;
};

export function AuthPrompt({ marketingUrl, loginUrl }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <a
        href={loginUrl}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        Log in
      </a>
      <a
        href={marketingUrl}
        className={buttonVariants({ variant: "primary", size: "sm" })}
      >
        Visit Flindev
      </a>
    </div>
  );
}
