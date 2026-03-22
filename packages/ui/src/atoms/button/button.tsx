import type { ComponentProps } from "react";
import classnames from "classnames";
import styles from "./button.module.css";
import {
  BUTTON_VARIANT_CLASSES,
  BUTTON_SIZE_CLASSES,
  type ButtonSize,
  type ButtonVariant,
} from "./button.variants";

export type ButtonProps = Pick<
  ComponentProps<"button">,
  "children" | "onClick" | "disabled"
> & {
  /**
   * The variant of the button, which determines its visual style.
   */
  variant?: ButtonVariant;

  /**
   * The size of the button, which determines its dimensions and font size.
   */
  size?: ButtonSize;
};

/**
 * Placeholder component for testing only
 */
export function Button({
  variant = "primary",
  size = "md",
  children,
  onClick,
  disabled,
}: ButtonProps) {
  return (
    <button
      type="button"
      className={classnames(
        styles.button,
        BUTTON_VARIANT_CLASSES[variant],
        BUTTON_SIZE_CLASSES[size],
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
