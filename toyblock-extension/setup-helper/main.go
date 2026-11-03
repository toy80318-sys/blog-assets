// 토이블록 설치 도우미 (Windows)
// 최신 토이블록 파일을 받아 지문(SHA-256)을 확인하고, 정해진 폴더에 풀어 둔 뒤
// 크롬 확장 프로그램 화면을 열고 폴더 경로를 클립보드에 복사합니다.
// 크롬 정책상 확장 프로그램을 '켜는' 마지막 단계(개발자 모드 · 압축해제된 확장 프로그램 로드)는 사용자가 직접 눌러야 합니다.
// 이미 설치돼 있으면 그 폴더를 찾아 새 버전으로 덮어씁니다(업데이트).
package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	appName    = "토이블록 네이버 블로그 도우미"
	versionURL = "https://raw.githubusercontent.com/toy80318-sys/blog-assets/main/toyblock-extension/update/version.json"
	guideURL   = "https://www.bpai.kr/toyblog"
)

var filesURLRe = regexp.MustCompile(`^https://raw\.githubusercontent\.com/toy80318-sys/blog-assets/`)

type latestInfo struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	FilesURL    string `json:"files_url"`
	FilesSHA256 string `json:"files_sha256"`
	StoreURL    string `json:"store_url"`
}

func say(format string, a ...any) { fmt.Printf(format+"\n", a...) }

func main() {
	consoleSetup()
	say("")
	say("  ==============================================")
	say("    토이블록 네이버 블로그 도우미 · 설치 도우미")
	say("  ==============================================")
	say("")
	if err := run(); err != nil {
		say("")
		say("  ✕ %s", err.Error())
		say("")
		say("  설치 안내 페이지에서 zip으로도 설치할 수 있어요: %s", guideURL)
		msgBox("토이블록 설치 도우미", "설치를 마치지 못했어요.\n\n"+err.Error()+"\n\n설치 안내 페이지: "+guideURL, 0x10)
		wait()
		os.Exit(1)
	}
	wait()
}

func run() error {
	// 1. 최신 버전 정보
	say("  [1/4] 최신 버전을 확인하고 있어요…")
	L, err := fetchLatest()
	if err != nil {
		return err
	}
	say("        최신 버전 v%s", L.Version)

	// 2. 파일 받기 + 지문 확인
	say("  [2/4] 토이블록 파일을 받고 있어요…")
	data, err := download(L.FilesURL, 30<<20)
	if err != nil {
		return fmt.Errorf("파일을 받지 못했어요 — %v (인터넷 연결을 확인해 주세요)", err)
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != strings.ToLower(L.FilesSHA256) {
		return errors.New("받은 파일의 지문이 맞지 않아요. 새 버전이 올라오는 중일 수 있어요 — 1~2분 뒤 다시 실행해 주세요")
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return fmt.Errorf("받은 파일을 열지 못했어요 — %v", err)
	}
	if err := checkManifest(zr, L.Version); err != nil {
		return err
	}
	say("        %d KB · 지문 확인 ✓", len(data)/1024)

	// 3. 설치할 폴더: 이미 설치된 토이블록이 있으면 그 폴더, 없으면 내 폴더\ToyBlock\nbx
	target, browser, existing := findInstalled()
	if target == "" {
		home, _ := os.UserHomeDir()
		target = filepath.Join(home, "ToyBlock", "nbx")
	}
	if existing {
		say("  [3/4] 이미 설치된 토이블록을 찾았어요. 새 버전으로 바꾸는 중이에요…")
	} else {
		say("  [3/4] 파일을 풀고 있어요…")
	}
	say("        %s", target)
	n, err := extract(zr, target)
	if err != nil {
		return fmt.Errorf("파일을 풀지 못했어요 — %v", err)
	}
	say("        파일 %d개 ✓", n)

	// 4. 크롬 확장 프로그램 화면 열기 + 경로 복사
	say("  [4/4] 크롬 확장 프로그램 화면을 여는 중이에요…")
	copied := setClipboard(target) == nil
	exe, scheme := findBrowser(browser)
	opened := false
	if exe != "" {
		opened = exec.Command(exe, scheme+"://extensions/").Start() == nil
	}

	say("")
	if existing {
		say("  ✓ v%s 버전 파일로 바꿨어요.", L.Version)
		say("")
		say("  확장 프로그램 화면의 [토이블록] 카드에서 ↻(새로고침) 버튼을 한 번 눌러 주세요.")
		say("  그다음 열어 둔 네이버 블로그 탭을 F5로 새로고침하면 끝이에요.")
		msgBox("토이블록 설치 도우미", fmt.Sprintf("v%s 버전으로 업데이트했어요.\n\n열린 확장 프로그램 화면에서 [토이블록] 카드의 ↻(새로고침) 버튼을 한 번 눌러 주세요.", L.Version), 0x40)
		return nil
	}
	steps := []string{
		"오른쪽 위 [개발자 모드] 스위치를 켜요.",
		"왼쪽 위 [압축해제된 확장 프로그램 로드]를 눌러요.",
		"폴더 고르는 창 아래 [폴더] 칸을 누르고 Ctrl+V → [폴더 선택].",
	}
	say("  ✓ 준비가 끝났어요. 크롬에서 아래 세 가지만 눌러 주세요.")
	say("")
	for i, s := range steps {
		say("    %d. %s", i+1, s)
	}
	say("")
	if copied {
		say("  폴더 경로는 이미 복사해 두었어요: %s", target)
	} else {
		say("  폴더 경로: %s", target)
	}
	if !opened {
		say("  크롬을 찾지 못했어요. 크롬 주소창에 chrome://extensions 를 입력해 주세요.")
	}
	say("  설치 뒤에는 새 버전이 나오면 토이블록 아이콘의 [지금 업데이트]로 바뀌어요.")
	say("  이 폴더는 지우거나 옮기지 말아 주세요(크롬이 계속 읽어요).")
	body := "크롬에서 세 가지만 눌러 주세요.\n\n1. 오른쪽 위 [개발자 모드] 켜기\n2. 왼쪽 위 [압축해제된 확장 프로그램 로드]\n3. 폴더 칸에 Ctrl+V → [폴더 선택]\n\n폴더 경로는 복사해 두었어요:\n" + target
	if !opened {
		body += "\n\n크롬 주소창에 chrome://extensions 를 입력해 주세요."
	}
	msgBox("토이블록 설치 도우미", body, 0x40)
	return nil
}

func client() *http.Client { return &http.Client{Timeout: 60 * time.Second} }

func download(url string, limit int64) ([]byte, error) {
	req, _ := http.NewRequest("GET", url+"?t="+fmt.Sprint(time.Now().Unix()), nil)
	req.Header.Set("User-Agent", "toyblock-setup")
	req.Header.Set("Cache-Control", "no-cache")
	res, err := client().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", res.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit {
		return nil, errors.New("파일이 너무 커요")
	}
	return b, nil
}

func fetchLatest() (*latestInfo, error) {
	b, err := download(versionURL, 1<<20)
	if err != nil {
		return nil, fmt.Errorf("버전 정보를 받지 못했어요 — %v (인터넷 연결을 확인해 주세요)", err)
	}
	var L latestInfo
	if err := json.Unmarshal(b, &L); err != nil {
		return nil, errors.New("버전 정보를 읽지 못했어요")
	}
	if L.Name != appName || !filesURLRe.MatchString(L.FilesURL) || len(L.FilesSHA256) != 64 || L.Version == "" {
		return nil, errors.New("버전 정보가 올바르지 않아요. 잠시 뒤 다시 실행해 주세요")
	}
	return &L, nil
}

func checkManifest(zr *zip.Reader, want string) error {
	for _, f := range zr.File {
		if f.Name != "manifest.json" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		defer rc.Close()
		var m struct{ Name, Version string }
		if err := json.NewDecoder(rc).Decode(&m); err != nil {
			return errors.New("받은 파일의 manifest.json을 읽지 못했어요")
		}
		if m.Name != appName || m.Version != want {
			return errors.New("받은 파일이 토이블록 최신 버전과 맞지 않아요")
		}
		return nil
	}
	return errors.New("받은 파일에 manifest.json이 없어요")
}

// 압축 풀기: 폴더 밖으로 나가는 경로는 막고, manifest.json은 맨 마지막에 씁니다
func extract(zr *zip.Reader, dst string) (int, error) {
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return 0, err
	}
	root, _ := filepath.Abs(dst)
	var man *zip.File
	n := 0
	write := func(f *zip.File) error {
		name := filepath.FromSlash(f.Name)
		p := filepath.Join(root, name)
		if !strings.HasPrefix(p, root+string(os.PathSeparator)) {
			return fmt.Errorf("잘못된 파일 경로: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			return os.MkdirAll(p, 0o755)
		}
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		defer rc.Close()
		b, err := io.ReadAll(io.LimitReader(rc, 20<<20))
		if err != nil {
			return err
		}
		if old, err := os.ReadFile(p); err == nil && bytes.Equal(old, b) {
			n++
			return nil
		}
		tmp := p + ".tbnew"
		if err := os.WriteFile(tmp, b, 0o644); err != nil {
			return err
		}
		if err := os.Rename(tmp, p); err != nil {
			os.Remove(tmp)
			return err
		}
		n++
		return nil
	}
	for _, f := range zr.File {
		if f.Name == "manifest.json" {
			man = f
			continue
		}
		if err := write(f); err != nil {
			return n, err
		}
	}
	if man != nil {
		if err := write(man); err != nil {
			return n, err
		}
	}
	return n, nil
}

// 크롬·엣지·웨일 프로필에서 압축해제로 불러온 토이블록 폴더를 찾습니다
func findInstalled() (path string, browser string, ok bool) {
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		return "", "", false
	}
	roots := []struct{ dir, name string }{
		{filepath.Join(local, "Google", "Chrome", "User Data"), "chrome"},
		{filepath.Join(local, "Naver", "Naver Whale", "User Data"), "whale"},
		{filepath.Join(local, "Microsoft", "Edge", "User Data"), "edge"},
	}
	for _, r := range roots {
		profiles, _ := filepath.Glob(filepath.Join(r.dir, "*"))
		for _, prof := range profiles {
			for _, fn := range []string{"Secure Preferences", "Preferences"} {
				b, err := os.ReadFile(filepath.Join(prof, fn))
				if err != nil {
					continue
				}
				var pr struct {
					Extensions struct {
						Settings map[string]struct {
							Path     string `json:"path"`
							Location int    `json:"location"`
						} `json:"settings"`
					} `json:"extensions"`
				}
				if json.Unmarshal(b, &pr) != nil {
					continue
				}
				for _, s := range pr.Extensions.Settings {
					if s.Location != 4 || s.Path == "" || !filepath.IsAbs(s.Path) {
						continue
					}
					mb, err := os.ReadFile(filepath.Join(s.Path, "manifest.json"))
					if err != nil {
						continue
					}
					var m struct{ Name string }
					if json.Unmarshal(mb, &m) == nil && m.Name == appName {
						return s.Path, r.name, true
					}
				}
			}
		}
	}
	return "", "", false
}

func findBrowser(prefer string) (string, string) {
	pf, pf86, local := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")
	cands := map[string][]string{
		"chrome": {filepath.Join(pf, `Google\Chrome\Application\chrome.exe`), filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`), filepath.Join(local, `Google\Chrome\Application\chrome.exe`)},
		"whale":  {filepath.Join(pf, `Naver\Naver Whale\Application\whale.exe`), filepath.Join(pf86, `Naver\Naver Whale\Application\whale.exe`), filepath.Join(local, `Naver\Naver Whale\Application\whale.exe`)},
		"edge":   {filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`), filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`)},
	}
	order := []string{"chrome", "whale", "edge"}
	if prefer != "" {
		order = append([]string{prefer}, order...)
	}
	for _, b := range order {
		for _, p := range cands[b] {
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				return p, b
			}
		}
	}
	return "", "chrome"
}

func wait() {
	say("")
	say("  Enter 키를 누르면 이 창이 닫혀요.")
	bufio.NewReader(os.Stdin).ReadString('\n')
}
