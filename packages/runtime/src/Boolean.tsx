import type { SVGAttributes } from "react";
import { dataNameAttr } from "./internal";

export type BooleanOp = "union" | "subtract" | "intersect" | "exclude";

export interface BooleanProps extends SVGAttributes<SVGGElement> {
  op?: BooleanOp;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  name?: string;
}

function BooleanOpComponent({
  op = "union",
  fill,
  stroke,
  strokeWidth,
  name,
  children,
  ...rest
}: BooleanProps) {
  return (
    <g
      {...rest}
      {...dataNameAttr(name, rest)}
      data-boolean-op={op}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    >
      {children}
    </g>
  );
}
export { BooleanOpComponent as Boolean };
