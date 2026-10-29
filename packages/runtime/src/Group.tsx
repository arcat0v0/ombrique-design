import type { HTMLAttributes } from "react";
import { joinClass } from "./internal";

export interface GroupProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
}

export function Group({ name, className, children, ...rest }: GroupProps) {
  return (
    <div
      {...rest}
      data-name={name}
      className={joinClass(className)}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}
