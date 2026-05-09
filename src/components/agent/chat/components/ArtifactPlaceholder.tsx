/**
 * @file Artifact 占位符组件
 * @description 在聊天消息中显示代码块的占位符卡片，点击可在画布中查看
 * @module components/agent/chat/components/ArtifactPlaceholder
 */

import React, { memo } from "react";
import { FileCode, ExternalLink, Loader2 } from "lucide-react";
import styled, { keyframes } from "styled-components";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const PlaceholderCard = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin: 8px 0;
  background: hsl(var(--muted) / 0.5);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: hsl(var(--muted));
    border-color: hsl(var(--primary) / 0.5);
  }
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: hsl(var(--primary) / 0.1);
  border-radius: 8px;
  color: hsl(var(--primary));
`;

const ContentWrapper = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Subtitle = styled.div`
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const SpinningLoader = styled(Loader2)`
  animation: ${spin} 1s linear infinite;
`;

const ActionIcon = styled.div`
  color: hsl(var(--muted-foreground));
  transition: color 0.2s;

  ${PlaceholderCard}:hover & {
    color: hsl(var(--primary));
  }
`;

interface ArtifactPlaceholderProps {
  /** 语言类型 */
  language: string;
  /** 代码行数 */
  lineCount?: number;
  /** 是否正在流式生成 */
  isStreaming?: boolean;
  /** 点击回调 */
  onClick?: () => void;
}

/**
 * 获取语言显示名称
 */
function getLanguageDisplayName(language: string): string {
  const displayNames: Record<string, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    python: "Python",
    rust: "Rust",
    go: "Go",
    java: "Java",
    cpp: "C++",
    c: "C",
    csharp: "C#",
    ruby: "Ruby",
    php: "PHP",
    swift: "Swift",
    kotlin: "Kotlin",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    json: "JSON",
    yaml: "YAML",
    xml: "XML",
    markdown: "Markdown",
    sql: "SQL",
    shell: "Shell",
    bash: "Bash",
    tsx: "TypeScript React",
    jsx: "JavaScript React",
    vue: "Vue",
    svelte: "Svelte",
  };

  const lower = language.toLowerCase();
  return displayNames[lower] || language.toUpperCase();
}

/**
 * Artifact 占位符组件
 * 在聊天消息中显示代码块的简洁卡片
 */
export const ArtifactPlaceholder: React.FC<ArtifactPlaceholderProps> = memo(
  ({ language, lineCount, isStreaming = false, onClick }) => {
    const displayName = getLanguageDisplayName(language);

    return (
      <PlaceholderCard onClick={onClick} role="button" tabIndex={0}>
        <IconWrapper>
          <FileCode size={20} />
        </IconWrapper>
        <ContentWrapper>
          <Title>{displayName} 代码</Title>
          <Subtitle>
            {isStreaming ? (
              <>
                <SpinningLoader size={12} />
                <span>生成中...</span>
              </>
            ) : lineCount ? (
              `${lineCount} 行`
            ) : (
              "点击在画布中查看"
            )}
          </Subtitle>
        </ContentWrapper>
        <ActionIcon>
          <ExternalLink size={16} />
        </ActionIcon>
      </PlaceholderCard>
    );
  },
);

ArtifactPlaceholder.displayName = "ArtifactPlaceholder";
