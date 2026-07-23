"use client";

import { type FormEvent, useState } from "react";

interface InvitationItem {
  readonly acceptedAt: string | null;
  readonly email: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly revokedAt: string | null;
}

interface MemberItem {
  readonly disabledAt: string | null;
  readonly email: string;
  readonly id: string;
  readonly name: string;
  readonly role: "ADMIN" | "MEMBER";
}

export function MemberAdministration({
  initialInvitations,
  initialMembers,
}: {
  readonly initialInvitations: readonly InvitationItem[];
  readonly initialMembers: readonly MemberItem[];
}) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [members, setMembers] = useState(initialMembers);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/admin/invitations", {
      body: JSON.stringify({
        email: data.get("email"),
        expiresInHours: Number(data.get("expiresInHours")),
      }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setMessage("The invitation could not be created.");
      return;
    }
    const body = (await response.json()) as {
      invitation: {
        email: string;
        expiresAt: string;
        id: string;
        token: string;
      };
    };
    setCreatedUrl(
      `${window.location.origin}/invite?token=${encodeURIComponent(
        body.invitation.token,
      )}`,
    );
    setInvitations((items) => [
      {
        acceptedAt: null,
        email: body.invitation.email,
        expiresAt: body.invitation.expiresAt,
        id: body.invitation.id,
        revokedAt: null,
      },
      ...items,
    ]);
    setMessage("Invitation created. This link is shown only once.");
    form.reset();
  }

  async function revokeInvitation(id: string) {
    const response = await fetch(`/api/admin/invitations/${id}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "DELETE",
    });
    if (response.ok) {
      setInvitations((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, revokedAt: new Date().toISOString() }
            : item,
        ),
      );
    }
  }

  async function memberAction(
    id: string,
    action: "disable" | "enable" | "revoke_sessions",
  ) {
    const response = await fetch(`/api/admin/members/${id}`, {
      body: JSON.stringify({ action }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) {
      setMessage("The member action could not be completed.");
      return;
    }
    if (action !== "revoke_sessions") {
      setMembers((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                disabledAt:
                  action === "disable" ? new Date().toISOString() : null,
              }
            : item,
        ),
      );
    }
    setMessage(
      action === "revoke_sessions"
        ? "Member sessions revoked."
        : "Member status updated.",
    );
  }

  async function removeMember(id: string) {
    if (
      !window.confirm(
        "Delete this member? Their actions, preferences, credentials, and sessions will be deleted. Audit events remain without an account link.",
      )
    ) {
      return;
    }
    const response = await fetch(`/api/admin/members/${id}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "DELETE",
    });
    if (response.ok)
      setMembers((items) => items.filter((item) => item.id !== id));
  }

  return (
    <>
      <section className="panel">
        <h2>Create invitation</h2>
        <form className="auth-form compact" onSubmit={create}>
          <label>
            Member email
            <input autoComplete="off" name="email" required type="email" />
          </label>
          <label>
            Expires
            <select defaultValue="168" name="expiresInHours">
              <option value="24">24 hours</option>
              <option value="168">7 days</option>
              <option value="720">30 days</option>
            </select>
          </label>
          <button type="submit">Create invitation</button>
        </form>
        {createdUrl ? (
          <label>
            One-time invitation link
            <input readOnly value={createdUrl} />
          </label>
        ) : null}
        {message ? <p aria-live="polite">{message}</p> : null}
      </section>
      <section className="panel">
        <h2>Invitations</h2>
        <ul className="session-list">
          {invitations.map((item) => {
            const active =
              !item.acceptedAt &&
              !item.revokedAt &&
              new Date(item.expiresAt) > new Date();
            return (
              <li key={item.id}>
                <div>
                  <strong>{item.email}</strong>
                  <small>
                    {item.acceptedAt
                      ? "Accepted"
                      : item.revokedAt
                        ? "Revoked"
                        : active
                          ? `Expires ${new Date(item.expiresAt).toLocaleString()}`
                          : "Expired"}
                  </small>
                </div>
                {active ? (
                  <button
                    onClick={() => void revokeInvitation(item.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="panel">
        <h2>Accounts</h2>
        <ul className="session-list">
          {members.map((member) => (
            <li key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <small>
                  {member.email} · {member.role.toLowerCase()}
                  {member.disabledAt ? " · disabled" : ""}
                </small>
              </div>
              {member.role === "MEMBER" ? (
                <div>
                  <button
                    onClick={() =>
                      void memberAction(
                        member.id,
                        member.disabledAt ? "enable" : "disable",
                      )
                    }
                    type="button"
                  >
                    {member.disabledAt ? "Enable" : "Disable"}
                  </button>
                  <button
                    onClick={() =>
                      void memberAction(member.id, "revoke_sessions")
                    }
                    type="button"
                  >
                    Revoke sessions
                  </button>
                  <button
                    onClick={() => void removeMember(member.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
