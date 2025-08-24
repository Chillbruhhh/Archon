import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  GitBranch, 
  Folder, 
  Code, 
  Globe, 
  AlertCircle,
  CheckCircle,
  Settings,
  FileText,
  Zap
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';
import { Badge } from '../ui/Badge';
import { ParseRepositoryRequest } from '../../services/knowledgeGraphService';

interface ParseRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParse: (request: ParseRepositoryRequest) => void;
  supportedLanguages: string[];
}

export const ParseRepositoryModal: React.FC<ParseRepositoryModalProps> = ({
  isOpen,
  onClose,
  onParse,
  supportedLanguages
}) => {
  // Form state
  const [formData, setFormData] = useState<ParseRepositoryRequest>({
    name: '',
    repository_url: '',
    branch_name: 'main',
    max_depth: 10,
    include_tests: true,
    language_filters: [],
    exclude_patterns: [
      'node_modules/**',
      '.git/**',
      '*.pyc',
      '__pycache__/**',
      '.env',
      '*.log'
    ]
  });

  const [step, setStep] = useState<'basic' | 'advanced' | 'confirm'>('basic');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('basic');
      setValidationErrors({});
      setFormData({
        name: '',
        repository_url: '',
        branch_name: 'main',
        max_depth: 10,
        include_tests: true,
        language_filters: [],
        exclude_patterns: [
          'node_modules/**',
          '.git/**',
          '*.pyc',
          '__pycache__/**',
          '.env',
          '*.log'
        ]
      });
    }
  }, [isOpen]);

  // Validation
  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Repository name is required';
    }

    if (!formData.repository_url.trim()) {
      errors.repository_url = 'Repository URL is required';
    } else {
      // Basic URL validation
      try {
        new URL(formData.repository_url);
      } catch {
        errors.repository_url = 'Please enter a valid URL';
      }
    }

    if (!formData.branch_name.trim()) {
      errors.branch_name = 'Branch name is required';
    }

    if (formData.max_depth < 1 || formData.max_depth > 50) {
      errors.max_depth = 'Max depth must be between 1 and 50';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Auto-fill name from URL
  const handleUrlChange = (url: string) => {
    setFormData(prev => ({
      ...prev,
      repository_url: url
    }));

    // Auto-extract repository name from URL
    if (url && !formData.name) {
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 2) {
          const repoName = pathParts[pathParts.length - 1].replace('.git', '');
          setFormData(prev => ({
            ...prev,
            name: repoName
          }));
        }
      } catch {
        // Invalid URL, ignore
      }
    }
  };

  const handleLanguageToggle = (language: string) => {
    setFormData(prev => ({
      ...prev,
      language_filters: prev.language_filters.includes(language)
        ? prev.language_filters.filter(l => l !== language)
        : [...prev.language_filters, language]
    }));
  };

  const handleExcludePatternChange = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      exclude_patterns: prev.exclude_patterns.map((pattern, i) => 
        i === index ? value : pattern
      )
    }));
  };

  const addExcludePattern = () => {
    setFormData(prev => ({
      ...prev,
      exclude_patterns: [...prev.exclude_patterns, '']
    }));
  };

  const removeExcludePattern = (index: number) => {
    setFormData(prev => ({
      ...prev,
      exclude_patterns: prev.exclude_patterns.filter((_, i) => i !== index)
    }));
  };

  const handleNext = () => {
    if (step === 'basic') {
      if (validateForm()) {
        setStep('advanced');
      }
    } else if (step === 'advanced') {
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'advanced') {
      setStep('basic');
    } else if (step === 'confirm') {
      setStep('advanced');
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsValidating(true);
    try {
      await onParse(formData);
    } finally {
      setIsValidating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-full max-w-2xl max-h-[90vh] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <Card accentColor="purple" variant="bordered" className="overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Parse
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Add a codebase to the knowledge graph
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Step indicator */}
                <div className="flex items-center gap-2">
                  {['basic', 'advanced', 'confirm'].map((stepName, index) => (
                    <div
                      key={stepName}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        step === stepName 
                          ? 'bg-purple-500' 
                          : index < ['basic', 'advanced', 'confirm'].indexOf(step)
                            ? 'bg-green-500'
                            : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    />
                  ))}
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  icon={<X className="w-4 h-4" />}
                />
              </div>
            </div>

            {/* Content */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <AnimatePresence mode="wait">
                {step === 'basic' && (
                  <motion.div
                    key="basic"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Repository URL *
                      </label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="https://github.com/user/repository"
                          value={formData.repository_url}
                          onChange={(e) => handleUrlChange(e.target.value)}
                          className="pl-10"
                          error={validationErrors.repository_url}
                        />
                      </div>
                      {validationErrors.repository_url && (
                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {validationErrors.repository_url}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Repository Name *
                      </label>
                      <div className="relative">
                        <Folder className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="my-repository"
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          className="pl-10"
                          error={validationErrors.name}
                        />
                      </div>
                      {validationErrors.name && (
                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {validationErrors.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Branch Name *
                      </label>
                      <div className="relative">
                        <GitBranch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="main"
                          value={formData.branch_name}
                          onChange={(e) => setFormData(prev => ({ ...prev, branch_name: e.target.value }))}
                          className="pl-10"
                          error={validationErrors.branch_name}
                        />
                      </div>
                      {validationErrors.branch_name && (
                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {validationErrors.branch_name}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}

                {step === 'advanced' && (
                  <motion.div
                    key="advanced"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Maximum Directory Depth
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="50"
                        value={formData.max_depth}
                        onChange={(e) => setFormData(prev => ({ ...prev, max_depth: parseInt(e.target.value) || 10 }))}
                        error={validationErrors.max_depth}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Limits how deep to traverse directory structure (1-50)
                      </p>
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        <Checkbox
                          checked={formData.include_tests}
                          onChange={(e) => setFormData(prev => ({ ...prev, include_tests: e.target.checked }))}
                        />
                        Include Test Files
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-500 ml-6">
                        Parse test files and include them in the knowledge graph
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Language Filters
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {supportedLanguages.map(language => (
                          <label key={language} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={formData.language_filters.includes(language)}
                              onChange={() => handleLanguageToggle(language)}
                            />
                            <span className="capitalize">{language}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                        Leave empty to parse all supported languages
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Exclude Patterns
                      </label>
                      <div className="space-y-2">
                        {formData.exclude_patterns.map((pattern, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              placeholder="e.g., *.log, node_modules/**"
                              value={pattern}
                              onChange={(e) => handleExcludePatternChange(index, e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeExcludePattern(index)}
                              icon={<X className="w-3 h-3" />}
                              accentColor="pink"
                            />
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addExcludePattern}
                          className="w-full"
                        >
                          Add Pattern
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                        Use glob patterns to exclude files and directories
                      </p>
                    </div>
                  </motion.div>
                )}

                {step === 'confirm' && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <h3 className="font-medium text-purple-800 dark:text-purple-200">
                          Ready to Parse
                        </h3>
                      </div>
                      <p className="text-sm text-purple-700 dark:text-purple-300">
                        Review the configuration below and click "Start Parsing" to begin.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Repository</p>
                          <p className="text-sm text-gray-900 dark:text-white mt-1">{formData.name}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Branch</p>
                          <p className="text-sm text-gray-900 dark:text-white mt-1">{formData.branch_name}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">URL</p>
                        <p className="text-sm text-gray-900 dark:text-white mt-1 font-mono break-all">
                          {formData.repository_url}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Max Depth</p>
                          <p className="text-sm text-gray-900 dark:text-white mt-1">{formData.max_depth}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Include Tests</p>
                          <p className="text-sm text-gray-900 dark:text-white mt-1">
                            {formData.include_tests ? 'Yes' : 'No'}
                          </p>
                        </div>
                      </div>

                      {formData.language_filters.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Languages</p>
                          <div className="flex flex-wrap gap-1">
                            {formData.language_filters.map(lang => (
                              <Badge key={lang} className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs">
                                {lang}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Exclude Patterns</p>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-xs font-mono">
                          {formData.exclude_patterns.filter(p => p.trim()).join(', ') || 'None'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                {step !== 'basic' && (
                  <Button
                    variant="outline"
                    onClick={handleBack}
                  >
                    Back
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                
                {step !== 'confirm' ? (
                  <Button
                    onClick={handleNext}
                    accentColor="purple"
                    disabled={step === 'basic' && Object.keys(validationErrors).length > 0}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    accentColor="purple"
                    icon={<Zap className="w-4 h-4" />}
                    disabled={isValidating}
                    neonLine
                  >
                    {isValidating ? 'Starting...' : 'Start Parsing'}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};