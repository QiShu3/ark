import re

URL_PATTERN = r'https?://[a-zA-Z0-9\-._~:/?#\[\]@!$&\'()*+,;=%]+'

def clean(text):
    text = re.sub(r'\(' + URL_PATTERN + r'\)', '', text)
    text = re.sub(r'<' + URL_PATTERN + r'>', '', text)
    text = re.sub(URL_PATTERN, '', text)
    text = re.sub(r'[*#`~_|\[\]]', '', text)
    return text

print(clean("我帮你搜索莫宁的详细养成攻略。<https://www.bing.com/search?q=%E9%B8%9F%E6%BD%AE%E8%8B%8F%E5%AE%88%E5%85%88%E5%85%88%E6%94%B6%E5%85%BB%E6%94%BB%E7%95%A5>"))
