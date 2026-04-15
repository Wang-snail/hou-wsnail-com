#!/usr/bin/env python3
"""
OpenCode Web Standalone - 简化版查询工具
完全自包含，无外部依赖
"""

import json
import re
from pathlib import Path
from typing import List, Dict, Any

class KnowledgeBase:
    """知识库查询类"""
    
    def __init__(self, kb_path: str = None):
        if kb_path is None:
            kb_path = Path(__file__).parent / "knowledge_snapshot.json"
        
        with open(kb_path, 'r', encoding='utf-8') as f:
            self.kb = json.load(f)
    
    def search(self, query: str) -> List[Dict[str, Any]]:
        """搜索知识（关键词匹配）"""
        results = []
        query_lower = query.lower()
        
        # 搜索市场规则
        if any(kw in query_lower for kw in ['市场', 'cr', 'hhi', '竞争', '垄断']):
            results.append({
                'type': 'market_rules',
                'content': self.kb['market_rules']
            })
        
        # 搜索理性框架
        if any(kw in query_lower for kw in ['理性', '话术', '验证', 'mece', '置信度']):
            results.append({
                'type': 'rational_framework',
                'content': self.kb['rational_framework']
            })
        
        # 搜索编码规范
        if any(kw in query_lower for kw in ['编码', '规范', '代码', '不可变', '错误']):
            results.append({
                'type': 'coding_standards',
                'content': self.kb['coding_standards']
            })
        
        # 搜索团队结构
        if any(kw in query_lower for kw in ['团队', '角色', '协作']):
            results.append({
                'type': 'team_structure',
                'content': self.kb['team_structure']
            })
        
        return results
    
    def analyze_market(self, cr10: float, hhi: float) -> Dict[str, Any]:
        """市场决策分析"""
        # CR10 决策
        if cr10 > 70:
            cr_decision = self.kb['market_rules']['cr10_decision_table']['>70%']
        elif cr10 >= 40:
            cr_decision = self.kb['market_rules']['cr10_decision_table']['40-70%']
        else:
            cr_decision = self.kb['market_rules']['cr10_decision_table']['<40%']
        
        # HHI 分析
        if hhi < 1000:
            hhi_level = self.kb['market_rules']['hhi_thresholds']['<1000']
        elif hhi <= 2000:
            hhi_level = self.kb['market_rules']['hhi_thresholds']['1000-2000']
        else:
            hhi_level = self.kb['market_rules']['hhi_thresholds']['>2000']
        
        return {
            'cr10_analysis': cr_decision,
            'hhi_analysis': hhi_level,
            'recommendation': self._generate_recommendation(cr_decision, hhi_level)
        }
    
    def detect_rhetoric(self, text: str) -> Dict[str, Any]:
        """话术检测"""
        rhetoric_types = self.kb['rational_framework']['layers']['L1_cognitive_defense']['rhetoric_types']
        
        detected = []
        text_lower = text.lower()
        
        patterns = {
            '情感共鸣': ['彻底改变', '革命性', '颠覆性', '惊艳', '不可思议'],
            '权威暗示': ['据权威', '专家认为', '官方数据', '研究证实'],
            '稀缺性': ['仅剩', '限时', '错过', '最后机会'],
            '术语堆砌': ['AI赋能', '生态闭环', '协同增效', '降维打击']
        }
        
        for rhetoric_type, keywords in patterns.items():
            if any(kw in text_lower for kw in keywords):
                detected.append({
                    'type': rhetoric_type,
                    'keywords': [kw for kw in keywords if kw in text_lower]
                })
        
        return {
            'has_rhetoric': len(detected) > 0,
            'detected_types': detected,
            'risk_level': 'high' if len(detected) > 0 else 'low'
        }
    
    def calculate_confidence(self, statement: str, evidence: List[str]) -> int:
        """置信度评分"""
        score = 50  # 基础分
        
        # 证据数量加分
        score += min(len(evidence) * 10, 30)
        
        # 证据质量（简化评估）
        for ev in evidence:
            if '官方' in ev or '财报' in ev:
                score += 10
            elif '权威' in ev or '第三方' in ev:
                score += 8
            elif '媒体' in ev:
                score += 5
        
        # 情绪词汇减分
        emotion_words = ['绝对', '一定', '肯定', '必须']
        if any(w in statement for w in emotion_words):
            score -= 15
        
        return max(0, min(100, score))
    
    def check_code(self, code: str) -> List[Dict[str, Any]]:
        """编码规范检查"""
        issues = []
        
        # 检查原地修改
        if re.search(r'\w+\[\w+\]\s*=\s*', code):
            issues.append({
                'type': 'immutability',
                'message': '检测到原地修改，违反不可变性原则',
                'severity': 'high'
            })
        
        # 检查深层嵌套
        nesting_level = code.count('    ')
        if nesting_level > 4:
            issues.append({
                'type': 'nesting',
                'message': f'嵌套层级过深（{nesting_level}层），建议重构',
                'severity': 'medium'
            })
        
        # 检查函数长度（简化）
        lines = code.split('\n')
        if len(lines) > 50:
            issues.append({
                'type': 'function_length',
                'message': f'函数过长（{len(lines)}行），建议拆分',
                'severity': 'medium'
            })
        
        return issues
    
    def _generate_recommendation(self, cr_decision: Dict, hhi_level: str) -> str:
        """生成综合建议"""
        action = cr_decision['action']
        
        if action == 'reject':
            return f"❌ 不建议进入：{cr_decision['reason']}（HHI：{hhi_level}）"
        elif action == 'cautious':
            return f"⚠️ 谨慎进入：{cr_decision['reason']}（HHI：{hhi_level}）。需评估差异化优势、头部品牌护城河强度、细分市场机会。"
        else:
            return f"✅ 可考虑进入：{cr_decision['reason']}（HHI：{hhi_level}）。仍需评估竞争格局和自身优势。"


def main():
    """命令行接口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='OpenCode Web Standalone Query Tool')
    parser.add_argument('action', choices=['search', 'analyze', 'detect', 'check'],
                       help='操作类型')
    parser.add_argument('--query', '-q', help='搜索关键词')
    parser.add_argument('--cr10', type=float, help='CR10 值')
    parser.add_argument('--hhi', type=float, help='HHI 值')
    parser.add_argument('--text', '-t', help='待检测文本')
    parser.add_argument('--code', '-c', help='待检查代码')
    
    args = parser.parse_args()
    kb = KnowledgeBase()
    
    if args.action == 'search':
        if not args.query:
            print("错误：搜索需要 --query 参数")
            return
        
        results = kb.search(args.query)
        print(f"找到 {len(results)} 条相关知识:")
        for r in results:
            print(f"\n  类型: {r['type']}")
            print(f"  内容: {json.dumps(r['content'], ensure_ascii=False, indent=2)[:200]}...")
    
    elif args.action == 'analyze':
        if args.cr10 is None or args.hhi is None:
            print("错误：分析需要 --cr10 和 --hhi 参数")
            return
        
        result = kb.analyze_market(args.cr10, args.hhi)
        print("\n📊 市场分析结果:")
        print(f"  CR10 分析: {result['cr10_analysis']}")
        print(f"  HHI 分析: {result['hhi_analysis']}")
        print(f"\n💡 建议: {result['recommendation']}")
    
    elif args.action == 'detect':
        if not args.text:
            print("错误：检测需要 --text 参数")
            return
        
        result = kb.detect_rhetoric(args.text)
        if result['has_rhetoric']:
            print("\n🚨 检测到话术红旗信号:")
            for dt in result['detected_types']:
                print(f"  - {dt['type']}: {', '.join(dt['keywords'])}")
            print(f"  风险等级: {result['risk_level']}")
        else:
            print("\n✅ 未检测到明显话术")
    
    elif args.action == 'check':
        if not args.code:
            print("错误：检查需要 --code 参数")
            return
        
        issues = kb.check_code(args.code)
        if issues:
            print("\n⚠️ 发现编码问题:")
            for issue in issues:
                print(f"  [{issue['severity'].upper()}] {issue['type']}: {issue['message']}")
        else:
            print("\n✅ 代码符合基本规范")


if __name__ == "__main__":
    main()
