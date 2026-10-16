import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button.js";
import { Field } from "../../components/ui/Field.js";
import { Input } from "../../components/ui/Input.js";

/**
 * Ledger 830: when a session is older than the fresh window, the server
 * answers `password_required` and the panel asks for the admin's own password
 * right there, then sends the same action again with it. The server checks
 * it; nothing here decides whether it is right. The password lives in this
 * form's state only until it is sent, and is never kept after that.
 */

/** The server's answer when an older session must confirm the password. */
export const PASSWORD_REQUIRED = "password_required";

export const PASSWORD_PROMPT_DESCRIPTION = "For your safety, confirm your password to continue.";

/**
 * The refusals of a password-carrying request that stay in the prompt,
 * because the admin can fix them there. Anything else (`null`) is the
 * action's own answer and belongs to the panel.
 */
export function passwordPromptError(code: string): string | null {
  switch (code) {
    case "invalid_password":
      return "That password is not right.";
    case "rate_limited":
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return null;
  }
}

export function PasswordPrompt({
  id,
  pending,
  error,
  onConfirm,
}: {
  id: string;
  pending: boolean;
  error: string | null;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [empty, setEmpty] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!password) {
      setEmpty(true);
      return;
    }
    // Out of this form the moment it is sent: a wrong one is typed again.
    setPassword("");
    onConfirm(password);
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={handleSubmit} noValidate>
      <Field
        label="Your password"
        htmlFor={id}
        description={PASSWORD_PROMPT_DESCRIPTION}
        error={empty ? "Password is required" : (error ?? undefined)}
      >
        <Input
          id={id}
          type="password"
          autoComplete="current-password"
          name="current-password"
          // It appears because the admin just asked for an action: typing
          // (or the password manager) can start straight away.
          autoFocus
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setEmpty(false);
          }}
        />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Confirm
        </Button>
      </div>
    </form>
  );
}
