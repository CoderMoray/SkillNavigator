import Link from "next/link";
import { Download, EyeOff, MessageSquare, Star, Users } from "lucide-react";
import { formatDateTime, formatNumber, formatSkillInspectionFailureSummary } from "../lib/format";
import {
  isInspectionFailureStatus,
  isSkillSearchResultUnlisted,
  resolveSkillDisplayVerdict,
} from "../lib/publish-helpers";
import type { SkillSearchResult } from "../lib/types";
import { SkillCategoryIcon } from "./SkillCategoryIcon";
import { VerdictBadge, SkillInspectionStatusBadge } from "./StatusBadge";

function SkillListIcon({ skill }: { skill: SkillSearchResult }) {
  const category = skill.categories[0];
  if (category) {
    return (
      <div className="skill-icon">
        <SkillCategoryIcon category={category} size={20} />
      </div>
    );
  }

  return <div className="skill-icon">{skill.name.slice(0, 1).toUpperCase()}</div>;
}

export function SkillCard({ skill, variant = "card" }: { skill: SkillSearchResult; variant?: "card" | "row" }) {
  const owner = skill.contributors.find((item) => item.role === "owner") ?? skill.contributors[0];

  if (variant === "row") {
    return (
      <Link className="skill-row" href={`/skills/${encodeURIComponent(skill.slug)}`}>
        <div className="skill-row-main">
          <SkillListIcon skill={skill} />
          <div>
            <div className="skill-row-title">
              <strong>{skill.name}</strong>
              <span>@{owner?.username ?? owner?.name ?? "unknown"}</span>
              {isSkillSearchResultUnlisted(skill) ? (
                <span className="badge badge-unpublished">
                  <EyeOff size={12} /> 已下架
                </span>
              ) : null}
            </div>
            <p>{skill.description}</p>
            {isInspectionFailureStatus(skill.inspectionStatus) && skill.inspectionFailure ? (
              <p className="skill-inspection-failure" title={skill.inspectionFailure.message}>
                {formatSkillInspectionFailureSummary(skill.inspectionFailure)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="skill-row-metrics">
          <span>
            <Star size={13} /> {skill.averageRating ? skill.averageRating.toFixed(1) : "new"}
          </span>
          <span>
            <Download size={13} /> {formatNumber(skill.downloads)}
          </span>
          {skill.inspectionStatus === "completed" ? (
            <VerdictBadge verdict={resolveSkillDisplayVerdict(skill.inspectionStatus, skill.status)} />
          ) : (
            <SkillInspectionStatusBadge
              status={skill.inspectionStatus}
              title={
                isInspectionFailureStatus(skill.inspectionStatus) && skill.inspectionFailure
                  ? formatSkillInspectionFailureSummary(skill.inspectionFailure)
                  : undefined
              }
            />
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link className="skill-card" href={`/skills/${encodeURIComponent(skill.slug)}`}>
      <div className="card-head">
        <div>
          <h3 className="skill-title">{skill.name}</h3>
          {isSkillSearchResultUnlisted(skill) ? (
            <span className="badge badge-unpublished">
              <EyeOff size={12} /> 已下架
            </span>
          ) : null}
          <SkillInspectionStatusBadge status={skill.inspectionStatus} />
          <div className="mono">latest@{skill.latestVersion}</div>
        </div>
        {skill.inspectionStatus === "completed" ? (
          <VerdictBadge verdict={resolveSkillDisplayVerdict(skill.inspectionStatus, skill.status)} />
        ) : null}
      </div>

      <p className="description">{skill.description}</p>

      <div className="tag-row">
        <span className="badge">
          <Star size={13} />
          {skill.averageRating ? skill.averageRating.toFixed(1) : "暂无评分"}
        </span>
        <span className="badge">
          <Download size={13} />
          {formatNumber(skill.downloads)}
        </span>
        <span className="badge">
          <MessageSquare size={13} />
          {skill.openIssues} issues
        </span>
      </div>

      <div className="card-foot">
        <span>
          <Users size={13} style={{ verticalAlign: "-2px" }} /> {owner?.name ?? "unknown"}
        </span>
        <span>{formatDateTime(skill.updatedAt)}</span>
      </div>
    </Link>
  );
}
