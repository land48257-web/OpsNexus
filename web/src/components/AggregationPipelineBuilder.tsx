import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import { useState } from 'react';
import { Plus, X, Play, ChevronDown, ChevronRight } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';

interface PipelineStage {
    id: string;
    operator: string;
    definition: string; // JSON string
    preview?: any[];
    isExpanded?: boolean;
    isLoading?: boolean;
}

interface AggregationPipelineBuilderProps {
    assetId: string;
    database: string;
    collection: string;
    onExecute?: (results: any[]) => void;
}

const STAGE_OPERATORS = [
    { value: '$match', label: 'aggregation.match' },
    { value: '$group', label: 'aggregation.group' },
    { value: '$project', label: 'aggregation.project' },
    { value: '$sort', label: 'aggregation.sort' },
    { value: '$limit', label: 'aggregation.limit' },
    { value: '$skip', label: 'aggregation.skip' },
    { value: '$unwind', label: 'aggregation.unwind' },
    { value: '$lookup', label: 'aggregation.lookup' },
    { value: '$addFields', label: 'aggregation.addFields' },
    { value: '$count', label: 'aggregation.count' },
] as const;

const STAGE_TEMPLATES: Record<string, string> = {
    '$match': '{\n  "status": "active"\n}',
    '$group': '{\n  "_id": "$category",\n  "count": { "$sum": 1 },\n  "total": { "$sum": "$amount" }\n}',
    '$project': '{\n  "_id": 1,\n  "name": 1,\n  "uppercaseName": { "$toUpper": "$name" }\n}',
    '$sort': '{\n  "createdAt": -1\n}',
    '$limit': '10',
    '$skip': '0',
    '$unwind': '"$tags"',
    '$lookup': '{\n  "from": "orders",\n  "localField": "_id",\n  "foreignField": "userId",\n  "as": "userOrders"\n}',
    '$addFields': '{\n  "fullName": { "$concat": ["$firstName", " ", "$lastName"] }\n}',
    '$count': '"totalDocuments"',
};

export function AggregationPipelineBuilder({
    assetId,
    database,
    collection,
    onExecute
}: AggregationPipelineBuilderProps) {
    const { t } = useTranslation();
    const [stages, setStages] = useState<PipelineStage[]>([]);
    const [isExecuting, setIsExecuting] = useState(false);
    const { theme } = useTheme();
    const authenticatedFetch = useAuthenticatedFetch();

    // Add a new stage
    const addStage = (operator: string) => {
        const newStage: PipelineStage = {
            id: `stage-${Date.now()}`,
            operator,
            definition: STAGE_TEMPLATES[operator] || '{}',
            isExpanded: true,
        };
        setStages([...stages, newStage]);
    };

    // Remove a stage
    const removeStage = (id: string) => {
        setStages(stages.filter(s => s.id !== id));
    };

    // Update stage definition
    const updateStageDefinition = (id: string, definition: string) => {
        setStages(stages.map(s =>
            s.id === id ? { ...s, definition } : s
        ));
    };

    // Toggle stage expansion
    const toggleStageExpansion = (id: string) => {
        setStages(stages.map(s =>
            s.id === id ? { ...s, isExpanded: !s.isExpanded } : s
        ));
    };

    // Preview a specific stage (show results up to that stage)
    const previewStage = async (stageIndex: number) => {
        setStages(stages.map((s, idx) =>
            idx === stageIndex ? { ...s, isLoading: true } : s
        ));

        try {
            // Build pipeline up to this stage
            const partialPipeline = stages.slice(0, stageIndex + 1).map(s => {
                const parsed = JSON.parse(s.definition);
                return { [s.operator]: parsed };
            });

            const response = await authenticatedFetch('/api/v1/mongo/aggregate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_id: assetId,
                    database,
                    collection,
                    pipeline: partialPipeline,
                    limit: 5, // Preview only 5 documents
                }),
            });

            if (!response.ok) {
                throw new Error(t('error.preview'));
            }

            const data = await response.json();

            setStages(stages.map((s, idx) =>
                idx === stageIndex
                    ? { ...s, preview: data.documents, isLoading: false }
                    : s
            ));
        } catch (error) {
            console.error('Preview error:', error);
            setStages(stages.map((s, idx) =>
                idx === stageIndex ? { ...s, isLoading: false } : s
            ));
            alert(t('error.previewDetail', { error: translateError(error) }));
        }
    };

    // Execute full pipeline
    const executeFullPipeline = async () => {
        setIsExecuting(true);

        try {
            const pipeline = stages.map(s => {
                const parsed = JSON.parse(s.definition);
                return { [s.operator]: parsed };
            });

            const response = await authenticatedFetch('/api/v1/mongo/aggregate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_id: assetId,
                    database,
                    collection,
                    pipeline,
                }),
            });

            if (!response.ok) {
                throw new Error(t('error.execute'));
            }

            const data = await response.json();
            onExecute?.(data.documents);
        } catch (error) {
            console.error('Execution error:', error);
            alert(t('error.executeDetail', { error: translateError(error) }));
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                <h2 className="text-sm font-semibold text-foreground">{t('aggregation.title')}</h2>

                {/* Add Stage Dropdown */}
                <div className="relative group">
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded transition-colors">
                        <Plus className="w-4 h-4" />
                        {t('aggregation.addStage')}
                    </button>
                    <div className="absolute right-0 mt-1 w-56 bg-popover border border-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        {STAGE_OPERATORS.map(op => (
                            <button
                                key={op.value}
                                onClick={() => addStage(op.value)}
                                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors"
                            >
                                {t(op.label)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Stages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {stages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                        <p>{t('aggregation.noStages')}</p>
                        <p className="text-xs mt-1">{t('aggregation.start')}</p>
                    </div>
                ) : (
                    stages.map((stage, index) => (
                        <div
                            key={stage.id}
                            className="border border-border rounded-lg bg-card overflow-hidden"
                        >
                            {/* Stage Header */}
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleStageExpansion(stage.id)}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        {stage.isExpanded ? (
                                            <ChevronDown className="w-4 h-4" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4" />
                                        )}
                                    </button>
                                    <span className="text-xs text-muted-foreground">{t('aggregation.stage', { number: index + 1 })}</span>
                                    <span className="text-sm font-mono text-primary">{stage.operator}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => previewStage(index)}
                                        disabled={stage.isLoading}
                                        className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-muted disabled:text-muted-foreground text-white rounded transition-colors"
                                    >
                                        <Play className="w-3 h-3" />
                                        {stage.isLoading ? t('common.loading') : t('common.preview')}
                                    </button>
                                    <button
                                        onClick={() => removeStage(stage.id)}
                                        className="text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Stage Body */}
                            {stage.isExpanded && (
                                <div className="p-3 space-y-2">
                                    {/* Monaco Editor for stage definition */}
                                    <div className="border border-border rounded overflow-hidden">
                                        <Editor
                                            loading={t('common.loading')}
                                            height="120px"
                                            language="json"
                                            theme={theme === 'light' ? 'light' : 'vs-dark'}
                                            value={stage.definition}
                                            onChange={(value) => updateStageDefinition(stage.id, value || '')}
                                            options={{
                                                minimap: { enabled: false },
                                                fontSize: 12,
                                                lineNumbers: 'off',
                                                scrollBeyondLastLine: false,
                                            }}
                                        />
                                    </div>

                                    {/* Preview Results */}
                                    {stage.preview && (
                                        <div className="mt-2">
                                            <div className="text-xs text-muted-foreground mb-1">
                                                {t('aggregation.preview', { count: stage.preview.length })}
                                            </div>
                                            <div className="bg-muted border border-border rounded p-2 max-h-40 overflow-auto">
                                                <pre className="text-xs text-foreground font-mono">
                                                    {JSON.stringify(stage.preview, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            {stages.length > 0 && (
                <div className="px-4 py-3 border-t border-border flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                        {t('aggregation.stages', { count: stages.length })}
                    </div>
                    <button
                        onClick={executeFullPipeline}
                        disabled={isExecuting}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-muted disabled:text-muted-foreground text-white text-sm rounded transition-colors"
                    >
                        {isExecuting ? t('common.executing') : t('aggregation.execute')}
                    </button>
                </div>
            )}
        </div>
    );
}
