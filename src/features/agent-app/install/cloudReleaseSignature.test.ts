import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  AgentAppCloudReleaseSignatureProof,
  AgentAppCloudReleaseSignatureTrustRoot,
  CloudBootstrapApp,
} from "../types";
import {
  buildCloudReleaseSignaturePayload,
  verifyCloudReleaseSignature,
} from "./cloudReleaseSignature";

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

interface SignedFixtureKeyMaterial {
  privateKey: CryptoKey;
  publicKeyBase64: string;
}

let signedFixtureKeyMaterial: Promise<SignedFixtureKeyMaterial> | null = null;

function buildCloudApp(
  overrides: Partial<CloudBootstrapApp> = {},
): CloudBootstrapApp {
  return {
    appId: "content-factory-app",
    displayName: "内容工厂",
    version: "0.3.0",
    releaseId: "release-001",
    channel: "stable",
    signatureRef: "sigstore:content-factory-app@0.3.0",
    registrationRequired: false,
    registrationState: "not_required",
    enabled: true,
    packageUrl:
      "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
    packageHash: PACKAGE_HASH,
    manifestHash: MANIFEST_HASH,
    capabilityRequirements: {},
    defaultEntries: ["dashboard"],
    policyDefaults: {},
    toolAvailability: [],
    ...overrides,
  };
}

async function getSignedFixtureKeyMaterial(): Promise<SignedFixtureKeyMaterial> {
  signedFixtureKeyMaterial ??= (async () => {
    const keyPair = await webcrypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    if (!("privateKey" in keyPair) || !("publicKey" in keyPair)) {
      throw new Error("RSA key generation did not return a key pair");
    }
    const publicKey = await webcrypto.subtle.exportKey(
      "spki",
      keyPair.publicKey,
    );
    return {
      privateKey: keyPair.privateKey,
      publicKeyBase64: toBase64(publicKey),
    };
  })();
  return signedFixtureKeyMaterial;
}

async function buildSignedFixture(options: {
  proof?: Partial<AgentAppCloudReleaseSignatureProof>;
  trustRoot?: Partial<AgentAppCloudReleaseSignatureTrustRoot>;
} = {}): Promise<{
  app: CloudBootstrapApp;
  trustRoot: AgentAppCloudReleaseSignatureTrustRoot;
}> {
  const app = buildCloudApp();
  const keyMaterial = await getSignedFixtureKeyMaterial();
  const proofDraft: AgentAppCloudReleaseSignatureProof = {
    schemaVersion: "agent-app-cloud-release-signature/v1",
    publicKeyId: "agent-app-root-2026",
    algorithm: "RSASSA-PKCS1-v1_5-SHA256",
    signature: "",
    signedAt: "2026-06-24T00:00:00.000Z",
    ...options.proof,
  };
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyMaterial.privateKey,
    new TextEncoder().encode(
      buildCloudReleaseSignaturePayload({
        ...app,
        signatureProof: proofDraft,
      }),
    ),
  );
  const proof: AgentAppCloudReleaseSignatureProof = {
    ...proofDraft,
    signature: toBase64(signature),
  };

  return {
    app: {
      ...app,
      signatureProof: proof,
    },
    trustRoot: {
      publicKeyId: proof.publicKeyId,
      algorithm: proof.algorithm,
      publicKey: keyMaterial.publicKeyBase64,
      appIds: [app.appId],
      ...options.trustRoot,
    },
  };
}

function toBase64(value: ArrayBuffer): string {
  return Buffer.from(value).toString("base64");
}

describe("cloudReleaseSignature", () => {
  it("应通过 trust root 验证 Cloud release 签名证明", async () => {
    const { app, trustRoot } = await buildSignedFixture();

    await expect(
      verifyCloudReleaseSignature({
        app,
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("verified");
  });

  it("signedAt 落在 trust root 有效期内时应通过验证", async () => {
    const { app, trustRoot } = await buildSignedFixture({
      trustRoot: {
        notBefore: "2026-01-01T00:00:00.000Z",
        notAfter: "2026-12-31T23:59:59.999Z",
      },
    });

    await expect(
      verifyCloudReleaseSignature({
        app,
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("verified");
  });

  it("signedAt 早于 trust root notBefore 时应 fail closed", async () => {
    const { app, trustRoot } = await buildSignedFixture({
      trustRoot: {
        notBefore: "2026-06-25T00:00:00.000Z",
        notAfter: "2026-12-31T23:59:59.999Z",
      },
    });

    await expect(
      verifyCloudReleaseSignature({
        app,
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("failed");
  });

  it("signedAt 晚于 trust root notAfter 时应 fail closed", async () => {
    const { app, trustRoot } = await buildSignedFixture({
      trustRoot: {
        notBefore: "2026-01-01T00:00:00.000Z",
        notAfter: "2026-06-23T23:59:59.999Z",
      },
    });

    await expect(
      verifyCloudReleaseSignature({
        app,
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("failed");
  });

  it("trust root 已撤销时应 fail closed", async () => {
    const { app, trustRoot } = await buildSignedFixture({
      trustRoot: {
        revoked: true,
        revokedAt: "2026-06-24T12:00:00.000Z",
      },
    });

    await expect(
      verifyCloudReleaseSignature({
        app,
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("failed");
  });

  it("trust root 有有效期但 proof 缺少 signedAt 时应 fail closed", async () => {
    const { app, trustRoot } = await buildSignedFixture({
      proof: { signedAt: undefined },
      trustRoot: {
        notBefore: "2026-01-01T00:00:00.000Z",
        notAfter: "2026-12-31T23:59:59.999Z",
      },
    });

    await expect(
      verifyCloudReleaseSignature({
        app,
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("failed");
  });

  it("trust root 有无效日期时应 fail closed", async () => {
    const { app, trustRoot } = await buildSignedFixture({
      trustRoot: {
        notBefore: "not-a-date",
      },
    });

    await expect(
      verifyCloudReleaseSignature({
        app,
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("failed");
  });

  it("signedAt 被篡改时应因 canonical payload 不匹配而失败", async () => {
    const { app, trustRoot } = await buildSignedFixture({
      trustRoot: {
        notBefore: "2026-01-01T00:00:00.000Z",
        notAfter: "2026-12-31T23:59:59.999Z",
      },
    });

    await expect(
      verifyCloudReleaseSignature({
        app: {
          ...app,
          signatureProof: {
            ...app.signatureProof!,
            signedAt: "2026-06-25T00:00:00.000Z",
          },
        },
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("failed");
  });

  it("proof 缺少可信根时应 fail closed", async () => {
    const { app } = await buildSignedFixture();

    await expect(
      verifyCloudReleaseSignature({
        app,
        trustRoots: [],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("failed");
  });

  it("签名 payload 被篡改时应 fail closed", async () => {
    const { app, trustRoot } = await buildSignedFixture();

    await expect(
      verifyCloudReleaseSignature({
        app: {
          ...app,
          packageHash:
            "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("failed");
  });

  it("没有 proof 但声明 signatureRef 时只返回 declared", async () => {
    await expect(
      verifyCloudReleaseSignature({
        app: buildCloudApp(),
        trustRoots: [],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("declared");
  });
});
