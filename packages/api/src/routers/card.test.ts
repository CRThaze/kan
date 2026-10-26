import { beforeEach, describe, expect, it, vi } from "vitest";

import * as cardRepo from "@kan/db/repository/card.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import type { WebhookPayload } from "../utils/webhook";
import { sendWebhooksForWorkspace } from "../utils/webhook";

vi.mock("@kan/db/repository/card.repo", () => ({
  getWorkspaceAndCardIdByCardPublicId: vi.fn(),
  getCardMemberRelationship: vi.fn(),
  hardDeleteCardMemberRelationship: vi.fn(),
  createCardMemberRelationship: vi.fn(),
  getByPublicId: vi.fn(),
}));

vi.mock("@kan/db/repository/cardActivity.repo", () => ({
  create: vi.fn(),
}));

vi.mock("@kan/db/repository/workspace.repo", () => ({
  getMemberByPublicId: vi.fn(),
}));

vi.mock("../utils/permissions", () => ({
  assertPermission: vi.fn(),
  assertCanEdit: vi.fn(),
  assertCanDelete: vi.fn(),
}));

vi.mock("../utils/webhook", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendWebhooksForWorkspace: vi.fn(),
}));

const mocked = <T>(fn: T) => fn as ReturnType<typeof vi.fn>;

describe("card.addOrRemoveMember webhooks", () => {
  const ctx = {
    user: { id: "user-123", name: "Diego", email: "d@example.com" },
    db: {},
  } as never;
  const input = {
    cardPublicId: "card-1234567",
    workspaceMemberPublicId: "member-12345",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocked(cardRepo.getWorkspaceAndCardIdByCardPublicId).mockResolvedValue({
      id: 7,
      createdBy: "user-123",
      workspaceId: 3,
      workspaceVisibility: "private",
      listPublicId: "list-1234567",
      listName: "To Do",
      boardPublicId: "board-123456",
      boardName: "Home Chores",
    });
    mocked(workspaceRepo.getMemberByPublicId).mockResolvedValue({ id: 11 });
    mocked(cardRepo.getByPublicId).mockResolvedValue({
      id: 7,
      publicId: input.cardPublicId,
      title: "[Kitchen] Run the Dishwasher",
      description: "",
      listId: 5,
      dueDate: null,
      list: { publicId: "list-1234567", name: "To Do" },
    });
    vi.mocked(sendWebhooksForWorkspace).mockResolvedValue(undefined);
  });

  // The webhook goes out after the mutation returns, so wait for it.
  const sentPayload = async (): Promise<WebhookPayload> => {
    await vi.waitFor(() =>
      expect(sendWebhooksForWorkspace).toHaveBeenCalledOnce(),
    );
    const [, workspaceId, payload] =
      vi.mocked(sendWebhooksForWorkspace).mock.lastCall ?? [];
    expect(workspaceId).toBe(3);
    if (!payload) throw new Error("no webhook payload sent");
    return payload;
  };

  it("sends card.updated with the added member in changes.member.to", async () => {
    const { cardRouter } = await import("./card");
    mocked(cardRepo.getCardMemberRelationship).mockResolvedValue(undefined);
    mocked(cardRepo.createCardMemberRelationship).mockResolvedValue({
      success: true,
    });

    await cardRouter.createCaller(ctx).addOrRemoveMember(input);

    const payload = await sentPayload();
    expect(payload.event).toBe("card.updated");
    expect(payload.data.card.publicId).toBe(input.cardPublicId);
    expect(payload.data.card.boardId).toBe("board-123456");
    expect(payload.data.list).toEqual({ id: "list-1234567", name: "To Do" });
    expect(payload.data.changes).toEqual({
      member: { from: null, to: input.workspaceMemberPublicId },
    });
  });

  it("sends card.updated with the removed member in changes.member.from", async () => {
    const { cardRouter } = await import("./card");
    mocked(cardRepo.getCardMemberRelationship).mockResolvedValue({
      cardId: 7,
      workspaceMemberId: 11,
    });
    mocked(cardRepo.hardDeleteCardMemberRelationship).mockResolvedValue({
      success: true,
    });

    await cardRouter.createCaller(ctx).addOrRemoveMember(input);

    const payload = await sentPayload();
    expect(payload.event).toBe("card.updated");
    expect(payload.data.changes).toEqual({
      member: { from: input.workspaceMemberPublicId, to: null },
    });
  });
});
