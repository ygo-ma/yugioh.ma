import styles from "./button.module.css";

export const BUTTON_VARIANT_CLASSES = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
};

export const BUTTON_SIZE_CLASSES = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

export type ButtonVariant = keyof typeof BUTTON_VARIANT_CLASSES;
export type ButtonSize = keyof typeof BUTTON_SIZE_CLASSES;
