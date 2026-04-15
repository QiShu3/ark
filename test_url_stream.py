class URLStripper:
    def __init__(self):
        self._url_pending = ""
        self._url_state = "NORMAL"

    def push(self, text: str) -> str:
        data = self._url_pending + (text or "")
        output = []
        i = 0
        while i < len(data):
            if self._url_state == "IN_URL_ANGLE":
                if data[i] == ">":
                    self._url_state = "NORMAL"
                i += 1
                continue
            elif self._url_state == "IN_URL_PAREN":
                if data[i] == ")":
                    self._url_state = "NORMAL"
                i += 1
                continue
            elif self._url_state == "IN_URL_RAW":
                # break on space or common chinese punctuation or english sentence endings
                if data[i].isspace() or data[i] in "。！？；\n>":
                    self._url_state = "NORMAL"
                    # do not consume the character, we want to keep it
                else:
                    i += 1
                    continue
                    
            remaining = data[i:]
            if remaining.startswith("<http"):
                self._url_state = "IN_URL_ANGLE"
                i += 5
                continue
            elif remaining.startswith("(http"):
                self._url_state = "IN_URL_PAREN"
                i += 5
                continue
            elif remaining.startswith("http://") or remaining.startswith("https://"):
                self._url_state = "IN_URL_RAW"
                i += 7
                continue
                
            # Partial match check
            # We must break if `remaining` could be the start of one of our markers.
            # A string is a prefix if a marker starts with it.
            # e.g., remaining is "<ht", marker is "<http"
            if any(m.startswith(remaining) for m in ["<http", "(http", "http://", "https://"]):
                break
                
            output.append(data[i])
            i += 1
            
        self._url_pending = data[i:]
        return "".join(output)

s = URLStripper()
chunks = ["我帮你搜索莫宁的攻略。<", "https://ww", "w.bing.com/search?q=123", ">这是后缀。"]
res = ""
for c in chunks:
    res += s.push(c)
res += s.push("")
print("Result 1:", res)

s = URLStripper()
chunks = ["看这个链接：http", "s://bing.com", "。结束了"]
res = ""
for c in chunks:
    res += s.push(c)
res += s.push("")
print("Result 2:", res)

s = URLStripper()
chunks = ["链接在[这里](htt", "p://x.com/a?b=c)哦"]
res = ""
for c in chunks:
    res += s.push(c)
res += s.push("")
print("Result 3:", res)
