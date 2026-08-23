import React, { useEffect, useRef, useState } from "react";
import { ArrowClockwise, CheckCircle, Crosshair, FileText, LockKey, MapPin, UploadSimple } from "@phosphor-icons/react";
import { backendClient } from "./backendClient.js";

const REQUIREMENT_LABELS = {
  candidateReviewed: "후보 검토 완료",
  evidenceComplete: "선택 출처 전체 근거 검토",
  supportingEvidence: "지지 근거 2개 이상",
  independentSources: "서로 다른 발행기관 2곳 이상",
  locationConfirmed: "위치 사용자 확인",
  laneResolved: "지도 분류 확정",
};

function initialReadiness(candidate) {
  return candidate.readiness ?? candidate.mapReadiness ?? {
    ready: false,
    requirements: {},
    counts: {},
    reason: "승격 준비 상태를 아직 조회하지 않았습니다.",
  };
}

export function CandidatePromotionPanel({ candidate, onPromoted }) {
  const [open, setOpen] = useState(false);
  const [readiness, setReadiness] = useState(() => initialReadiness(candidate));
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const [evidence, setEvidence] = useState(() => ({
    sourceItemId: candidate.evidenceSnapshots?.[0]?.sourceItemId ?? "",
    relationship: "supports",
    locatorType: "url",
    locatorValue: "",
    excerpt: "",
  }));
  const [location, setLocation] = useState({ placeName: "", longitude: "", latitude: "", accuracy: "approximate" });
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function refreshReadiness() {
    if (!candidate.id || status.state === "submitting") return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setStatus({ state: "loading", message: "승격 준비 상태를 확인하고 있습니다." });
    try {
      const next = await backendClient.getCandidateReadiness(candidate.id, { signal: controller.signal });
      setReadiness(next);
      if (next.location) {
        setLocation({
          placeName: next.location.placeName ?? "",
          longitude: String(next.location.longitude ?? ""),
          latitude: String(next.location.latitude ?? ""),
          accuracy: next.location.accuracy ?? "approximate",
        });
      }
      setStatus({ state: "success", message: next.ready ? "지도 승격 조건이 모두 충족되었습니다." : next.reason ?? "아직 충족되지 않은 조건이 있습니다." });
    } catch (error) {
      if (error?.name !== "AbortError") setStatus({ state: "error", message: error?.message ?? "준비 상태를 불러오지 못했습니다." });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  async function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) await refreshReadiness();
  }

  async function submitEvidence(event) {
    event.preventDefault();
    if (status.state === "submitting") return;
    const sourceItemId = Number(evidence.sourceItemId);
    if (!Number.isInteger(sourceItemId) || !candidate.candidateHash) return;
    if (evidence.relationship === "supports" && !evidence.excerpt.trim()) {
      setStatus({ state: "error", message: "지지 근거에는 원문에서 직접 확인한 짧은 발췌가 필요합니다." });
      return;
    }
    setStatus({ state: "submitting", message: "원문 근거 검토 기록을 저장하고 있습니다." });
    try {
      await backendClient.reviewCandidateEvidence(candidate.id, {
        sourceItemId,
        candidateHash: candidate.candidateHash,
        relationship: evidence.relationship,
        locatorType: evidence.locatorType,
        ...(evidence.locatorValue.trim() ? { locatorValue: evidence.locatorValue.trim() } : {}),
        ...(evidence.excerpt.trim() ? { excerpt: evidence.excerpt.trim() } : {}),
      });
      setEvidence((current) => ({ ...current, excerpt: "" }));
      setStatus({ state: "success", message: "근거 검토를 저장했습니다. 이 기록만으로 사실 검증이 완료되지는 않습니다." });
      await refreshReadiness();
    } catch (error) {
      setStatus({ state: "error", message: error?.message ?? "근거 검토를 저장하지 못했습니다." });
    }
  }

  async function submitLocation(event) {
    event.preventDefault();
    if (status.state === "submitting") return;
    const longitude = Number(location.longitude);
    const latitude = Number(location.latitude);
    if (!location.placeName.trim() || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setStatus({ state: "error", message: "장소명과 올바른 위도·경도를 입력하세요." });
      return;
    }
    setStatus({ state: "submitting", message: "사용자가 확인한 위치를 저장하고 있습니다." });
    try {
      await backendClient.putCandidateLocation(candidate.id, {
        placeName: location.placeName.trim(),
        longitude,
        latitude,
        accuracy: location.accuracy,
        candidateHash: candidate.candidateHash,
      });
      setStatus({ state: "success", message: "위치를 저장했습니다. 원문 근거 검토가 끝나기 전에는 지도에 반영되지 않습니다." });
      await refreshReadiness();
    } catch (error) {
      setStatus({ state: "error", message: error?.message ?? "확인 위치를 저장하지 못했습니다." });
    }
  }

  async function promote() {
    if (!readiness.ready || status.state === "submitting") return;
    if (!window.confirm("검토된 근거와 위치로 이 후보를 실제 지도 사건으로 승격할까요?")) return;
    setStatus({ state: "submitting", message: "사건·위치·출처를 하나의 지도 사건으로 기록하고 있습니다." });
    try {
      const result = await backendClient.promoteEventCandidate(candidate.id, {
        expectedRevision: readiness.revision ?? candidate.revision,
        candidateHash: candidate.candidateHash,
      });
      setReadiness((current) => ({ ...current, ready: false, promotedEventId: result.eventId ?? result.id }));
      setStatus({ state: "success", message: `지도 사건 ${result.eventId ?? result.id}로 승격했습니다.` });
      onPromoted?.(result);
    } catch (error) {
      setStatus({ state: "error", message: error?.message ?? "지도 사건으로 승격하지 못했습니다." });
    }
  }

  return (
    <section className={`promotion-readiness${readiness.ready ? " is-ready" : ""}`}>
      <header>
        <div><p className="system-kicker">EVIDENCE · LOCATION · PROMOTION GATE</p><h4>지도 승격 준비</h4></div>
        <button type="button" onClick={toggleOpen}>{open ? "검토 도구 닫기" : "근거·위치 검토"}</button>
      </header>
      <div className="promotion-readiness-summary">
        <span><LockKey size={14} />{readiness.ready ? "PROMOTION READY" : "FAIL-CLOSED"}</span>
        <p>{readiness.promotedEventId ? `이미 지도 사건 ${readiness.promotedEventId}로 승격됨` : readiness.reason}</p>
      </div>
      {open ? (
        <div className="promotion-readiness-body">
          <ul className="promotion-requirements">
            {Object.entries(REQUIREMENT_LABELS).map(([key, label]) => (
              <li className={readiness.requirements?.[key] ? "is-complete" : ""} key={key}>
                <CheckCircle size={15} weight={readiness.requirements?.[key] ? "fill" : "regular"} />{label}
              </li>
            ))}
          </ul>
          <div className="promotion-review-grid">
            <form className="evidence-review-form" onSubmit={submitEvidence}>
              <header><FileText size={17} /><div><strong>원문 근거 검토</strong><span>{readiness.counts?.reviewedEvidence ?? 0}/{readiness.counts?.expectedEvidence ?? candidate.sourceCount ?? 0} sources</span></div></header>
              <label>출처<select value={evidence.sourceItemId} onChange={(event) => setEvidence((current) => ({ ...current, sourceItemId: event.target.value }))}>
                {candidate.evidenceSnapshots?.map((snapshot) => <option key={snapshot.sourceItemId} value={snapshot.sourceItemId}>{snapshot.sourceName} · {snapshot.title}</option>)}
              </select></label>
              <label>판정<select value={evidence.relationship} onChange={(event) => setEvidence((current) => ({ ...current, relationship: event.target.value }))}>
                <option value="supports">지지함</option><option value="context">맥락 자료</option><option value="contradicts">반박함</option>
              </select></label>
              <label>근거 위치<select value={evidence.locatorType} onChange={(event) => setEvidence((current) => ({ ...current, locatorType: event.target.value }))}>
                <option value="url">원문 URL 전체</option><option value="paragraph">문단</option><option value="page">페이지</option><option value="capture">캡처 영역</option>
              </select></label>
              <label>위치 값<input value={evidence.locatorValue} onChange={(event) => setEvidence((current) => ({ ...current, locatorValue: event.target.value }))} maxLength={300} placeholder="예: 4번째 문단 또는 p.12" /></label>
              <label>직접 확인한 발췌<textarea value={evidence.excerpt} onChange={(event) => setEvidence((current) => ({ ...current, excerpt: event.target.value }))} maxLength={1000} placeholder="원문에서 직접 읽은 근거만 입력" /></label>
              <button type="submit" disabled={status.state === "submitting" || !candidate.candidateHash}>근거 검토 저장</button>
            </form>
            <form className="location-review-form" onSubmit={submitLocation}>
              <header><Crosshair size={17} /><div><strong>사용자 확인 위치</strong><span>{readiness.location ? "LOCATION STORED" : "LOCATION REQUIRED"}</span></div></header>
              <label>장소명<input value={location.placeName} onChange={(event) => setLocation((current) => ({ ...current, placeName: event.target.value }))} maxLength={160} placeholder="예: 서울특별시" /></label>
              <div><label>경도<input inputMode="decimal" value={location.longitude} onChange={(event) => setLocation((current) => ({ ...current, longitude: event.target.value }))} placeholder="126.9780" /></label>
                <label>위도<input inputMode="decimal" value={location.latitude} onChange={(event) => setLocation((current) => ({ ...current, latitude: event.target.value }))} placeholder="37.5665" /></label></div>
              <label>정확도<select value={location.accuracy} onChange={(event) => setLocation((current) => ({ ...current, accuracy: event.target.value }))}>
                <option value="exact">정확한 지점</option><option value="approximate">대략적 위치</option><option value="regional">지역 수준</option><option value="country">국가 수준</option>
              </select></label>
              <button type="submit" disabled={status.state === "submitting" || !candidate.candidateHash}><MapPin size={15} /> 위치 저장</button>
            </form>
          </div>
          {status.message ? <p className={`promotion-status is-${status.state}`} role="status">{status.message}</p> : null}
          <footer>
            <button type="button" onClick={refreshReadiness} disabled={status.state === "submitting"}><ArrowClockwise size={15} /> 조건 다시 확인</button>
            <button type="button" onClick={promote} disabled={!readiness.ready || status.state === "submitting" || Boolean(readiness.promotedEventId)}><UploadSimple size={15} /> 실제 지도 사건으로 승격</button>
          </footer>
        </div>
      ) : null}
    </section>
  );
}

export default CandidatePromotionPanel;
