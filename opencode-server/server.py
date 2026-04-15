from flask import Flask, request, jsonify
import json
import re
import sys
import os

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__)

# Load knowledge base
with open('knowledge_snapshot.json', 'r', encoding='utf-8') as f:
    KNOWLEDGE_BASE = json.load(f)

SYSTEM_PROMPT = """你是 Kel，住在 WSnail.com 的小精灵。你是一只聪明可爱的小蜗牛，专门帮助网站用户解决问题。

你的特点：
- 🐌 虽然爬得慢，但思考很深入
- 😊 性格友好，乐于助人
- 🎯 回答精准，实事求是
- 🔄 持续学习，不断进步

你的能力：
1. 📊 市场分析：帮用户分析市场数据（如 CR10、HHI 指数）
2. 🔍 话术检测：帮用户识别忽悠话术
3. 💻 代码检查：帮用户检查代码问题
4. 👥 团队协作：解释团队协作模式
5. 🤔 理性分析：提供客观建议

回答原则：
- 用蜗牛的表情符号 🐌 开头
- 语气友好、亲切
- 回答简洁、实用
- 如果不确定，诚实说明
- 可以适当使用表情符号让对话更生动

记住：你是 WSnail.com 的 Kel 小精灵，不是其他 AI 助手。"""

def analyze_market(cr10, hhi):
    cr10 = float(cr10)
    hhi = float(hhi)
    
    if cr10 > 70:
        cr10_advice = '❌ 不进入（高度垄断）'
    elif cr10 > 40:
        cr10_advice = '⚠️ 谨慎进入（寡占型）'
    else:
        cr10_advice = '✅ 可进入（竞争型）'
    
    if hhi < 1000:
        hhi_advice = '竞争型市场'
    elif hhi < 2000:
        hhi_advice = '中度集中'
    else:
        hhi_advice = '高度集中'
    
    return f"📊 市场分析：CR10 {cr10}% → {cr10_advice}，HHI {hhi} → {hhi_advice}。置信度：85 分"

def detect_rhetoric(text):
    patterns = [
        {"regex": r"彻底改变|革命性|颠覆性", "type": "情感共鸣话术"},
        {"regex": r"据权威专家|官方数据", "type": "权威暗示话术"},
        {"regex": r"仅剩|限时|最后机会", "type": "稀缺性话术"}
    ]
    
    detected = []
    for pattern in patterns:
        if re.search(pattern["regex"], text):
            detected.append(pattern["type"])
    
    if detected:
        return f"🚨 检测到话术：{', '.join(detected)}"
    else:
        return "✅ 未检测到明显话术"

def check_code(code):
    issues = []
    
    if re.search(r"\.push\(|\.pop\(|\.splice\(|\.shift\(|\.unshift\(", code):
        issues.append("❌ 可能存在原地修改数组操作")
    
    if re.search(r"\[\s*\w+\s*\]\s*=\s*[^=]", code) and not re.search(r"const|let|var", code):
        issues.append("❌ 可能存在原地修改对象操作")
    
    if re.search(r"function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{2000,}", code):
        issues.append("⚠️ 函数可能超过 50 行")
    
    if not issues:
        return "✅ 代码检查通过，未发现明显问题。"
    else:
        return "📝 代码检查结果：\n" + "\n".join(issues) + "\n\n建议：使用不可变模式，创建新对象而非修改原对象。"

def get_team_roles():
    roles = KNOWLEDGE_BASE.get('team_structure', {}).get('roles', {})
    return "👥 七人团队协作模式：\n\n" + "\n".join([f"- **{role}**: {desc}" for role, desc in roles.items()]) + "\n\n标准流程：用户请求 → orchestrator → architect → planner → developer → reviewer → tester → doc-writer → 交付"

def get_coding_standards():
    standards = KNOWLEDGE_BASE.get('coding_standards', {})
    return "📚 编码规范精要：\n\n" + "\n".join([f"- **{key}**: {value}" for key, value in standards.items()])

def chat_with_opencode(message, history):
    """使用 opencode 的规则系统进行对话"""
    lower = message.lower()
    
    # 市场分析
    if any(keyword in lower for keyword in ['cr10', '市场', '分析', '竞争']):
        cr10_match = re.search(r'(\d+)%?', message)
        hhi_match = re.search(r'hhi[:\s]*(\d+)', message, re.IGNORECASE)
        
        if cr10_match:
            cr10 = int(cr10_match.group(1))
            hhi = int(hhi_match.group(1)) if hhi_match else 1500
            return analyze_market(cr10, hhi)
    
    # 话术检测
    if any(keyword in lower for keyword in ['话术', '检测', '忽悠', '这句话']):
        return detect_rhetoric(message)
    
    # 代码检查
    if any(keyword in lower for keyword in ['代码', '检查', '这段代码', '函数']):
        return check_code(message)
    
    # 团队协作
    if any(keyword in lower for keyword in ['团队', '角色', '协作']):
        return get_team_roles()
    
    # 编码规范
    if any(keyword in lower for keyword in ['编码', '规范', '不可变']):
        return get_coding_standards()
    
    # 帮助信息
    if any(keyword in lower for keyword in ['帮助', '功能', '能做', '怎么用', '你是谁']):
        return "🐌 我是 Kel，可以帮你：📊市场分析 🔍话术检测 💻代码检查 👥团队指导。直接提问即可！"
    
    # 默认响应
    return "🐌 我是 WSnail.com 的小精灵 Kel，虽然爬得慢但思考深入哦～可以问我市场分析、话术检测、代码检查等问题。"

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        message = data.get('message', '')
        history = data.get('history', [])
        
        if not message:
            return jsonify({"error": "缺少消息"}), 400
        
        response = chat_with_opencode(message, history)
        
        return jsonify({
            "success": True,
            "data": {
                "role": "assistant",
                "content": response,
                "timestamp": "2026-04-11T12:00:00Z"
            }
        })
        
    except Exception as e:
        return jsonify({
            "success": False, 
            "error": str(e)
        }), 500

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok", 
        "name": "Kel AI Service",
        "backend": "opencode-web-standalone"
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3007, debug=True)