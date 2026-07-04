import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ForceGraph2D from "react-force-graph-2d";
import { getGraphData, getTopics } from "../api/interview";
import { getTopicIcon } from "../utils/topicIcons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PAGE_CLASS = "flex-1 w-full max-w-[1600px] mx-auto px-4 py-6 md:px-7 md:py-8 xl:px-10 2xl:px-12";
const SIMILARITY_THRESHOLD = 0.65;

const SCORE_FILTERS = [
  { key: "all", label: "All" },
  { key: "weak", label: "To be replenished" },
  { key: "mid", label: "critical" },
  { key: "strong", label: "stable" },
];

export default function Graph() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState({});
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [zoomLevel, setZoomLevel] = useState(1);
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 960, height: 620 });

  useEffect(() => {
    getTopics().then(setTopics).catch(() => {});
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions({
        width,
        height: Math.max(480, Math.min(width * 0.62, 760)),
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const configureGraphLayout = useCallback(() => {
    const graph = fgRef.current;
    if (!graph) return;

    graph.d3Force("charge")?.strength(-150);
    graph.d3Force("link")?.distance(76);
    graph.d3ReheatSimulation?.();
  }, []);

  const handleSelectTopic = async (key) => {
    setSelectedTopic(key);
    setGraphData(null);
    setHoveredNode(null);
    setSelectedNodeId(null);
    setSearchQuery("");
    setScoreFilter("all");
    setAreaFilter("all");
    setLoading(true);

    try {
      const data = await getGraphData(key);
      setGraphData(data);
      setTimeout(() => {
        configureGraphLayout();
        fgRef.current?.zoomToFit(500, 56);
      }, 80);
    } catch {
      setGraphData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  };

  const topicEntries = Object.entries(topics);
  const selectedTopicInfo = selectedTopic ? topics[selectedTopic] : null;
  const focusAreas = useMemo(() => {
    if (!graphData?.nodes?.length) return [];

    return [...new Set(
      graphData.nodes
        .map((node) => node.focus_area?.trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [graphData]);

  const filteredGraphData = useMemo(() => {
    if (!graphData) return null;

    const query = searchQuery.trim().toLowerCase();
    const nodes = graphData.nodes.filter((node) => {
      const matchesQuery = !query
        || node.question.toLowerCase().includes(query)
        || (node.focus_area || "").toLowerCase().includes(query);
      const matchesScore = matchesScoreFilter(node, scoreFilter);
      const matchesArea = areaFilter === "all" || (node.focus_area || "") === areaFilter;
      return matchesQuery && matchesScore && matchesArea;
    });

    const visibleIds = new Set(nodes.map((node) => node.id));
    const links = graphData.links.filter((link) => {
      const sourceId = getEntityId(link.source);
      const targetId = getEntityId(link.target);
      return visibleIds.has(sourceId) && visibleIds.has(targetId);
    });

    return { nodes, links };
  }, [areaFilter, graphData, scoreFilter, searchQuery]);

  useEffect(() => {
    setHoveredNode(null);
  }, [areaFilter, scoreFilter, searchQuery, selectedTopic]);

  useEffect(() => {
    if (!filteredGraphData?.nodes?.length) {
      setSelectedNodeId(null);
      return;
    }

    if (selectedNodeId == null) return;
    const visibleIds = new Set(filteredGraphData.nodes.map((node) => node.id));
    if (!visibleIds.has(selectedNodeId)) setSelectedNodeId(null);
  }, [filteredGraphData, selectedNodeId]);

  const selectedNode = useMemo(() => {
    if (selectedNodeId == null || !graphData?.nodes) return null;
    return graphData.nodes.find((node) => node.id === selectedNodeId) || null;
  }, [graphData, selectedNodeId]);

  const graphInsights = useMemo(() => {
    const nodes = filteredGraphData?.nodes || [];
    const links = filteredGraphData?.links || [];

    const weakCount = nodes.filter((node) => node.score < 6).length;
    const stableCount = nodes.filter((node) => node.score >= 8).length;
    const avgScore = nodes.length
      ? roundScore(nodes.reduce((sum, node) => sum + node.score, 0) / nodes.length)
      : null;

    const focusAreaMap = new Map();
    for (const node of nodes) {
      const key = node.focus_area || "Not labeled";
      focusAreaMap.set(key, (focusAreaMap.get(key) || 0) + 1);
    }

    const topAreas = [...focusAreaMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    return {
      nodeCount: nodes.length,
      linkCount: links.length,
      weakCount,
      stableCount,
      avgScore,
      topAreas,
    };
  }, [filteredGraphData]);

  const activeGraph = filteredGraphData || { nodes: [], links: [] };

  const selectionMeta = useMemo(() => {
    const connectedNodeIds = new Set();
    const connectedLinkKeys = new Set();

    if (selectedNodeId == null || !filteredGraphData?.links) {
      return { connectedNodeIds, connectedLinkKeys, relatedNodes: [] };
    }

    for (const link of filteredGraphData.links) {
      const sourceId = getEntityId(link.source);
      const targetId = getEntityId(link.target);
      if (sourceId !== selectedNodeId && targetId !== selectedNodeId) continue;

      connectedNodeIds.add(sourceId);
      connectedNodeIds.add(targetId);
      connectedLinkKeys.add(getLinkKey(sourceId, targetId));
    }

    const relatedNodes = filteredGraphData.nodes
      .filter((node) => node.id !== selectedNodeId && connectedNodeIds.has(node.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    return { connectedNodeIds, connectedLinkKeys, relatedNodes };
  }, [filteredGraphData, selectedNodeId]);

  const paintNode = useCallback((node, ctx) => {
    const nodeId = node.id;
    const baseRadius = getNodeRadius(node);
    const selected = nodeId === selectedNodeId;
    const hovered = hoveredNode?.id === nodeId;
    const connected = selectionMeta.connectedNodeIds.has(nodeId);
    const dimmed = selectedNodeId != null && !selected && !connected;
    const color = scoreToColor(node.score);
    const isLight = !document.documentElement.classList.contains("dark");
    const textColor = isLight ? "#18181B" : "#FAFAF9";
    const radius = baseRadius + (selected ? 2.5 : hovered ? 1.2 : 0);

    ctx.save();
    ctx.globalAlpha = dimmed ? 0.2 : 1;

    if (selected || hovered) {
      ctx.shadowColor = color;
      ctx.shadowBlur = selected ? 24 : 14;
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (selected || hovered) {
      ctx.strokeStyle = selected ? textColor : "rgba(250,250,249,0.85)";
      ctx.lineWidth = selected ? 2.2 : 1.4;
      ctx.stroke();
    }

    const label = node.focus_area || truncate(node.question, 18);
    ctx.font = `${selected || hovered ? 12 : 10}px DM Sans, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = textColor;
    ctx.globalAlpha = dimmed ? 0.28 : selected || hovered ? 1 : 0.76;
    ctx.fillText(label, node.x, node.y - radius - 7);
    ctx.restore();
  }, [hoveredNode, selectedNodeId, selectionMeta.connectedNodeIds]);

  const paintLink = useCallback((link, ctx) => {
    const sourceId = getEntityId(link.source);
    const targetId = getEntityId(link.target);
    const selected = selectionMeta.connectedLinkKeys.has(getLinkKey(sourceId, targetId));
    const alphaBase = Math.max(0.08, (link.similarity - SIMILARITY_THRESHOLD) * 3);
    const alpha = selectedNodeId == null ? alphaBase : selected ? Math.max(alphaBase, 0.46) : 0.035;

    ctx.save();
    ctx.strokeStyle = selected ? `rgba(245,158,11,${alpha})` : `rgba(161,161,170,${alpha})`;
    ctx.lineWidth = selected ? 1.4 + link.similarity * 1.2 : 0.5 + link.similarity * 1.3;
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);
    ctx.stroke();
    ctx.restore();
  }, [selectedNodeId, selectionMeta.connectedLinkKeys]);

  const hoveredPreview = hoveredNode && hoveredNode.id !== selectedNodeId ? hoveredNode : null;

  const handleNodeClick = (node) => {
    setSelectedNodeId(node.id);
    fgRef.current?.centerAt(node.x, node.y, 400);
    fgRef.current?.zoom(Math.max(fgRef.current?.zoom?.() || 1, 2.1), 500);
  };

  const handleZoom = (factor) => {
    const graph = fgRef.current;
    if (!graph) return;
    const current = graph.zoom?.() || zoomLevel || 1;
    graph.zoom(clamp(current * factor, 0.45, 6), 250);
  };

  const handleResetView = () => {
    setSelectedNodeId(null);
    fgRef.current?.zoomToFit(500, 56);
  };

  const graphHasData = activeGraph.nodes.length > 0;
  const hasActiveFilters = searchQuery.trim() || scoreFilter !== "all" || areaFilter !== "all";

  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="text-3xl font-display font-bold tracking-tight md:text-4xl">Question map</div>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-dim">
            This page is no longer just for displaying bubbles, but for locating weak questions, viewing related questions, and deciding on the next training action.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SummaryChip label="field" value={topicEntries.length} hint="switchable" />
          <SummaryChip label="node" value={graphInsights.nodeCount} hint={selectedTopic ? "Current filter results" : "To be selected"} />
          <SummaryChip label="connect" value={graphInsights.linkCount} hint="semantic similarity" />
        </div>
      </div>

      <Card className="mt-4 border-border/80 bg-card/76">
        <CardContent className="p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text">Domain switching</div>
              <div className="mt-1 text-sm text-dim">Horizontal scrolling switches to avoid field label wrapping and disrupting the layout.</div>
            </div>
            <div className="rounded-full border border-border/80 bg-background/70 px-3 py-1 text-xs text-dim">
              Currently supports dragging, wheel zooming, and node clicks
            </div>
          </div>

          <div className="mt-4 -mx-1 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2 px-1">
              {topicEntries.map(([key, info]) => {
                const selected = selectedTopic === key;
                return (
                  <Button
                    key={key}
                    variant={selected ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-10 rounded-full px-4",
                      selected
                        ? "border border-primary/60 bg-primary/14 text-text shadow-[0_0_0_1px_rgba(245,158,11,0.08)]"
                        : "border border-transparent hover:border-border/80"
                    )}
                    onClick={() => handleSelectTopic(key)}
                  >
                    <span className="mr-1.5 inline-flex align-middle">{getTopicIcon(info.icon, 14)}</span>
                    {info.name}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_auto_auto]">
            <Input
              value={searchQuery}
              disabled={!selectedTopic}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={selectedTopic ? "Search topic or focus area" : "Select the field first, then search for the topic"}
            />

            <div className="flex flex-wrap gap-2">
              {SCORE_FILTERS.map((item) => (
                <Button
                  key={item.key}
                  variant={scoreFilter === item.key ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "rounded-full px-4",
                    scoreFilter === item.key && "border border-primary/45 bg-primary/10 text-text"
                  )}
                  disabled={!selectedTopic}
                  onClick={() => setScoreFilter(item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            <label className={cn(
              "flex min-w-[220px] items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background/75 px-3 py-2.5 text-sm",
              !selectedTopic && "opacity-60"
            )}>
              <span className="shrink-0 text-dim">Focus Area</span>
              <select
                className="min-w-0 flex-1 bg-transparent text-right text-text outline-none"
                value={areaFilter}
                disabled={!selectedTopic}
                onChange={(event) => setAreaFilter(event.target.value)}
              >
                <option value="all">All</option>
                {focusAreas.map((area) => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.36fr)_380px] 2xl:grid-cols-[minmax(0,1.42fr)_400px]">
        <Card
          ref={containerRef}
          className="relative overflow-hidden rounded-[28px] border-border/80 bg-card/86"
          style={{ minHeight: dimensions.height }}
        >
          <CardContent className="relative p-0">
            {selectedTopic && graphHasData && (
              <>
                <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[320px] rounded-[20px] border border-border/80 bg-background/82 px-4 py-3 shadow-sm backdrop-blur-sm">
                  <div className="text-sm font-semibold text-text">Legend</div>
                  <div className="mt-2 space-y-2 text-xs leading-5 text-dim">
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {[
                        { label: "Questions to be answered <4", color: "bg-red" },
                        { label: "critical question 4-6", color: "bg-orange" },
                        { label: "Familiar questions 6-8", color: "bg-primary" },
                        { label: "stable question 8+", color: "bg-green" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-1.5">
                          <span className={cn("inline-block h-2.5 w-2.5 rounded-full", item.color)} />
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                    <div>The larger the node, the higher the difficulty of the question. The brighter the line, the closer the semantics of the question are.</div>
                    <div>Use the scroll wheel to zoom, drag the canvas, and click on the node to lock the details on the right.</div>
                  </div>
                </div>

                <div className="absolute right-3 top-3 z-10 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleZoom(0.82)}>zoom out</Button>
                  <Button variant="outline" size="sm" onClick={() => handleZoom(1.22)}>Zoom in</Button>
                  <Button variant="outline" size="sm" onClick={handleResetView}>Adapt view</Button>
                </div>
              </>
            )}

            {!selectedTopic && (
              <EmptyGraphState
                title="Choose an area first"
                description="The map only displays related questions in a certain training field. Switch fields first, and then look at the similar relationships between the topics."
              />
            )}

            {loading && (
              <div className="flex min-h-[480px] items-center justify-center gap-2 text-sm text-dim">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.2s]" />
                Building graph...
              </div>
            )}

            {selectedTopic && !loading && graphData && graphData.nodes.length === 0 && (
              <EmptyGraphState
                title="There is no map of this field yet"
                description="There are currently no scored specific training questions available for mapping. Complete a few special training sessions first, then come back and check the correlation map."
                action={(
                  <Button variant="gradient" onClick={() => navigate("/")}>
                    Go start special training
                  </Button>
                )}
              />
            )}

            {selectedTopic && !loading && graphData && graphData.nodes.length > 0 && !graphHasData && (
              <EmptyGraphState
                title="No matching questions"
                description="The current search or filter excludes all nodes. Clear the conditions and then view the whole picture."
                action={(
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setScoreFilter("all");
                      setAreaFilter("all");
                    }}
                  >
                    Clear filter
                  </Button>
                )}
              />
            )}

            {selectedTopic && !loading && graphHasData && (
              <ForceGraph2D
                ref={fgRef}
                graphData={activeGraph}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="transparent"
                nodeCanvasObject={paintNode}
                nodePointerAreaPaint={(node, color, ctx) => {
                  const radius = getNodeRadius(node) + 6;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
                  ctx.fillStyle = color;
                  ctx.fill();
                }}
                linkCanvasObject={paintLink}
                onNodeHover={setHoveredNode}
                onNodeClick={handleNodeClick}
                onBackgroundClick={() => setSelectedNodeId(null)}
                onZoom={({ k }) => setZoomLevel(roundScore(k))}
                cooldownTicks={100}
                d3AlphaDecay={0.026}
                d3VelocityDecay={0.33}
              />
            )}

            {hoveredPreview && graphHasData && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[360px] rounded-[20px] border border-border/80 bg-background/84 px-4 py-3 shadow-lg backdrop-blur-sm">
                <div className="text-sm font-medium leading-6 text-text">{hoveredPreview.question}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-dim">
                  <ScorePill score={hoveredPreview.score} compact />
                  {hoveredPreview.focus_area && <Badge variant="outline">{hoveredPreview.focus_area}</Badge>}
                  {hoveredPreview.date && <span>{hoveredPreview.date}</span>}
                  <span>difficulty {hoveredPreview.difficulty || 3}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-[28px] border-border/80 bg-card/88">
            <CardContent className="p-5 md:p-6">
              <PanelHeader
                title={selectedNode ? "Node details" : "Plot summary"}
                caption={selectedNode
                  ? "Click in an empty space to deselect."
                  : "First look at the overall picture from the right side, and then click on the nodes to view specific questions."}
              />

              {selectedNode ? (
                <NodeDetailPanel
                  node={selectedNode}
                  relatedNodes={selectionMeta.relatedNodes}
                  zoomLevel={zoomLevel}
                  onOpenReview={() => selectedNode.session_id && navigate(`/review/${selectedNode.session_id}`)}
                  onClear={() => setSelectedNodeId(null)}
                />
              ) : (
                <GraphSummaryPanel
                  graphInsights={graphInsights}
                  selectedTopicInfo={selectedTopicInfo}
                  scoreFilter={scoreFilter}
                  areaFilter={areaFilter}
                  hasActiveFilters={Boolean(hasActiveFilters)}
                />
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 bg-card/88">
            <CardContent className="p-5 md:p-6">
              <PanelHeader
                title="Operation tips"
                caption="Think of this picture as a workbench, not a poster."
              />

              <div className="mt-4 space-y-3 text-sm leading-6 text-text">
                <HintRow title="How to read colors" body="Red and orange give priority to review, green indicates that it has been relatively stable, and yellow indicates an intermediate state that still needs to be consolidated." />
                <HintRow title="How to use click" body="After clicking on the node, the question details, occurrence times, recommended actions and the latest review entry will be displayed on the right side." />
                <HintRow title="How to narrow the scope" body="Prioritize search + Score screening, compress the map to the set of questions you currently want to deal with." />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryChip({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card/82 px-3.5 py-2.5 backdrop-blur-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-dim/80">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-xl font-semibold tracking-tight text-primary tabular-nums">{value}</div>
        <div className="text-xs text-dim">{hint}</div>
      </div>
    </div>
  );
}

function PanelHeader({ title, caption }) {
  return (
    <div>
      <div className="text-base font-semibold text-text">{title}</div>
      {caption && <div className="mt-1 text-sm leading-6 text-dim">{caption}</div>}
    </div>
  );
}

function EmptyGraphState({ title, description, action }) {
  return (
    <div className="flex min-h-[480px] items-center justify-center px-6 py-12">
      <div className="max-w-md rounded-[26px] border border-dashed border-border/80 bg-background/55 px-6 py-8 text-center">
        <div className="text-lg font-semibold text-text">{title}</div>
        <div className="mt-2 text-sm leading-6 text-dim">{description}</div>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

function GraphSummaryPanel({ graphInsights, selectedTopicInfo, scoreFilter, areaFilter, hasActiveFilters }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricTile label="average score" value={graphInsights.avgScore != null ? `${graphInsights.avgScore}/10` : "--"} />
        <MetricTile label="Number of questions to be filled" value={graphInsights.weakCount} valueClassName={graphInsights.weakCount ? "text-red" : "text-text"} />
        <MetricTile label="Stable number of questions" value={graphInsights.stableCount} valueClassName={graphInsights.stableCount ? "text-green" : "text-text"} />
        <MetricTile label="Semantic connection" value={graphInsights.linkCount} />
      </div>

      <div className="rounded-[22px] border border-border/80 bg-background/70 p-4">
        <div className="text-sm font-semibold text-text">current context</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-dim">
          <Badge variant="outline">{selectedTopicInfo?.name || "No field selected"}</Badge>
          <Badge variant="outline">Score filter {buildScoreFilterLabel(scoreFilter)}</Badge>
          <Badge variant="outline">Focus Area {areaFilter === "all" ? "All" : areaFilter}</Badge>
          {hasActiveFilters && <Badge variant="secondary">Filtering enabled</Badge>}
        </div>
      </div>

      <div className="rounded-[22px] border border-border/80 bg-background/70 p-4">
        <div className="text-sm font-semibold text-text">high frequency Focus Area</div>
        <div className="mt-3 space-y-2">
          {graphInsights.topAreas.length > 0 ? graphInsights.topAreas.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-text">{item.label}</span>
              <Badge variant="secondary">{item.count}</Badge>
            </div>
          )) : (
            <div className="text-sm text-dim">After selecting an area, the focus area with the most concentrated nodes will be displayed here.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeDetailPanel({ node, relatedNodes, zoomLevel, onOpenReview, onClear }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-[22px] border border-border/80 bg-background/70 p-4">
        <div className="text-sm leading-7 text-text">{node.question}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ScorePill score={node.score} />
          <Badge variant="outline">average {node.avg_score}/10</Badge>
          <Badge variant="outline">highest {node.best_score}/10</Badge>
          <Badge variant="outline">appear {node.attempts || 1} times</Badge>
          <Badge variant="outline">difficulty {node.difficulty || 3}</Badge>
          {node.focus_area && <Badge variant="outline">{node.focus_area}</Badge>}
        </div>
        <div className="mt-3 text-xs text-dim">
          Recently appeared {node.date || "--"} · Current canvas zoom {zoomLevel}x
        </div>
      </div>

      <div className="rounded-[22px] border border-primary/20 bg-primary/8 p-4">
        <div className="text-sm font-semibold text-text">Recommended actions</div>
        <div className="mt-2 text-sm leading-6 text-text">{buildNodeRecommendation(node)}</div>
      </div>

      <div className="rounded-[22px] border border-border/80 bg-background/70 p-4">
        <div className="text-sm font-semibold text-text">Related questions</div>
        <div className="mt-3 space-y-2">
          {relatedNodes.length > 0 ? relatedNodes.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border/70 bg-card/80 px-3 py-2.5">
              <div className="text-sm leading-6 text-text">{item.focus_area || truncate(item.question, 28)}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-dim">
                <span>{item.score}/10</span>
                {item.focus_area && <span>{item.focus_area}</span>}
              </div>
            </div>
          )) : (
            <div className="text-sm text-dim">The current node has no similar questions that reach the threshold.</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onClear}>Uncheck</Button>
        {node.session_id && (
          <Button variant="gradient" onClick={onOpenReview}>
            View the latest review
          </Button>
        )}
      </div>
    </div>
  );
}

function MetricTile({ label, value, valueClassName = "text-primary" }) {
  return (
    <div className="rounded-[20px] border border-border/80 bg-background/70 px-4 py-3.5">
      <div className="text-xs text-dim">{label}</div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", valueClassName)}>{value}</div>
    </div>
  );
}

function HintRow({ title, body }) {
  return (
    <div className="rounded-[20px] border border-border/80 bg-background/70 px-4 py-3.5">
      <div className="text-sm font-semibold text-text">{title}</div>
      <div className="mt-1 text-sm leading-6 text-dim">{body}</div>
    </div>
  );
}

function ScorePill({ score, compact = false }) {
  if (score == null) {
    return <Badge variant="secondary">--</Badge>;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "justify-center rounded-full border-transparent font-semibold",
        compact ? "px-2.5 py-0.5 text-[12px]" : "px-3 py-1 text-[13px]"
      )}
      style={{
        background: getScoreBg(score),
        color: scoreToColor(score),
      }}
    >
      {score}/10
    </Badge>
  );
}

function getNodeRadius(node) {
  return 6 + (node.difficulty || 3) * 1.35;
}

function matchesScoreFilter(node, filter) {
  if (filter === "all") return true;
  if (filter === "weak") return node.score < 4;
  if (filter === "mid") return node.score >= 4 && node.score < 8;
  if (filter === "strong") return node.score >= 8;
  return true;
}

function buildScoreFilterLabel(filter) {
  return SCORE_FILTERS.find((item) => item.key === filter)?.label || "All";
}

function buildNodeRecommendation(node) {
  if (node.score < 4) {
    return "This is a clear weak question. First read the most recent review, repeat the answers according to the review suggestions, and then fill in a question with the same focus area to verify whether it is really filled in.";
  }
  if (node.score < 6) {
    return "This question is in the critical area. It's not that I can't do it at all, but the expression and structure are still unstable. It is recommended to condense the answer into a 1-minute answer first, and then add the key missing points.";
  }
  if (node.score < 8) {
    return "There is a foundation for this question, but it is not stable enough. It is recommended to make the answers into a fixed structure and focus on adding counterexamples, boundaries and engineering trade-offs to prevent points from dropping next time.";
  }
  return "This question is already relatively stable and can be retained as an advantage template. The next step is not to continue working on the same question, but to use it to drive adjacent question types and verify knowledge transfer.";
}

function getEntityId(value) {
  return typeof value === "object" ? value.id : value;
}

function getLinkKey(sourceId, targetId) {
  return sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
}

function truncate(value, maxLength = 32) {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function roundScore(value) {
  const rounded = Number(Number(value).toFixed(1));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreToColor(score) {
  if (score >= 8) return "#22C55E";
  if (score >= 6) return "#FBBF24";
  if (score >= 4) return "#FB923C";
  return "#EF4444";
}

function getScoreBg(score) {
  if (score >= 8) return "rgba(34,197,94,0.15)";
  if (score >= 6) return "rgba(245,158,11,0.15)";
  if (score >= 4) return "rgba(251,146,60,0.16)";
  return "rgba(239,68,68,0.15)";
}
