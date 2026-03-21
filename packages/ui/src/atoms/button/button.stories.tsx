import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { Button } from "./button";
import type { MouseEventHandler } from "react";
import { BUTTON_SIZE_CLASSES, BUTTON_VARIANT_CLASSES } from "./button.variants";

const meta = {
  component: Button,
  title: "Atoms/Button",
  args: {
    children: "Button",
    onClick: fn<MouseEventHandler<HTMLButtonElement>>(),
  },
  argTypes: {
    variant: {
      control: "select",
      options: Object.keys(BUTTON_VARIANT_CLASSES),
    },
    size: { control: "select", options: Object.keys(BUTTON_SIZE_CLASSES) },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary" },
};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

export const Ghost: Story = {
  args: { variant: "ghost" },
};

export const Small: Story = {
  args: { size: "sm" },
};

export const Large: Story = {
  args: { size: "lg" },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const ClickTest: Story = {
  play: async ({ canvasElement, args }) => {
    const button = canvasElement.querySelector("button");
    if (!button) throw new Error("Button not found");
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const DisabledClickTest: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const button = canvasElement.querySelector("button");
    if (!button) throw new Error("Button not found");
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
