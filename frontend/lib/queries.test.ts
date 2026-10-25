import { describe, it, expect } from "vitest";
import { queryKeys } from "./queries";

describe("query key namespacing by user id", () => {
  it("namespaces dashboard key by user id", () => {
    const keyUser1 = queryKeys.dashboard("usr_abc");
    const keyUser2 = queryKeys.dashboard("usr_xyz");

    expect(keyUser1).toEqual(["autopulse", "usr_abc", "dashboard"]);
    expect(keyUser2).toEqual(["autopulse", "usr_xyz", "dashboard"]);
    expect(keyUser1).not.toEqual(keyUser2);
  });

  it("namespaces posts key with optional filters by user id", () => {
    const key1 = queryKeys.posts("usr_123");
    const key2 = queryKeys.posts("usr_123", { status: "awaiting_approval" });

    expect(key1).toEqual(["autopulse", "usr_123", "posts", {}]);
    expect(key2).toEqual([
      "autopulse",
      "usr_123",
      "posts",
      { status: "awaiting_approval" },
    ]);
  });

  it("namespaces post detail and image keys by user id and post id", () => {
    const detailKey = queryKeys.post("usr_123", "post_456");
    const imageKey = queryKeys.postImage("usr_123", "post_456", 480);

    expect(detailKey).toEqual(["autopulse", "usr_123", "post", "post_456"]);
    expect(imageKey).toEqual([
      "autopulse",
      "usr_123",
      "post-image",
      "post_456",
      480,
    ]);
  });

  it("namespaces profile and connections keys by user id", () => {
    expect(queryKeys.profile("usr_123")).toEqual([
      "autopulse",
      "usr_123",
      "profile",
    ]);
    expect(queryKeys.connections("usr_123")).toEqual([
      "autopulse",
      "usr_123",
      "connections",
    ]);
  });

  it("falls back to anonymous namespace if empty userId provided", () => {
    expect(queryKeys.dashboard("")).toEqual(["autopulse", "anonymous", "dashboard"]);
  });
});
