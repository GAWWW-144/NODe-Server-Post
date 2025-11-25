const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 로그인 체크
const checkLogin = (req, res, next) => {
    if (!req.session.user) return res.redirect('/');
    next();
};

// 1. 목록 조회
router.get('/', checkLogin, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const type = req.query.type || 'free';
    const search = req.query.search || '';
    const limit = 10;
    const offset = (page - 1) * limit;
    const searchParam = `%${search}%`;

    const countQuery = 'SELECT COUNT(*) AS count FROM posts WHERE type = ? AND title LIKE ?';
    db.query(countQuery, [type, searchParam], (err, countResult) => {
        if (err) throw err;
        const totalPages = Math.ceil(countResult[0].count / limit);

        const listQuery = `
            SELECT p.*, u.user_name FROM posts p 
            JOIN users u ON p.user_id = u.user_id 
            WHERE p.type = ? AND p.title LIKE ? 
            ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;

        db.query(listQuery, [type, searchParam, limit, offset], (err, posts) => {
            if (err) throw err;
            res.render('board/list', {
                title: type === 'notice' ? '공지사항' : '자유게시판',
                posts, currentPage: page, totalPages, search, type, user: req.session.user
            });
        });
    });
});

// 2. 글쓰기 화면
router.get('/write', checkLogin, (req, res) => {
    res.render('board/write', { user: req.session.user, type: req.query.type || 'free' });
});

// 3. 글 저장
router.post('/write', checkLogin, (req, res) => {
    const { type, title, content } = req.body;
    db.query('INSERT INTO posts (user_id, type, title, content) VALUES (?, ?, ?, ?)', 
        [req.session.user.user_id, type, title, content], (err) => {
        if (err) throw err;
        res.redirect(`/posts?type=${type}`);
    });
});

// 4. 상세보기 (조회수 증가)
router.get('/view/:id', checkLogin, (req, res) => {
    db.query('UPDATE posts SET view_count = view_count + 1 WHERE post_id = ?', [req.params.id], (err) => {
        if (err) throw err;
        db.query('SELECT p.*, u.user_name FROM posts p JOIN users u ON p.user_id = u.user_id WHERE post_id = ?', 
            [req.params.id], (err, result) => {
            if (err) throw err;
            res.render('board/view', { post: result[0], user: req.session.user });
        });
    });
});

// 5. 글 수정 화면 (GET)
router.get('/edit/:id', checkLogin, (req, res) => {
    db.query('SELECT * FROM posts WHERE post_id = ?', [req.params.id], (err, result) => {
        if (err) throw err;
        const post = result[0];
        const isAdmin = req.session.user.email === 'admin@example.com';

        // [보안] 공지사항은 관리자만 수정 가능
        if (post.type === 'notice' && !isAdmin) {
            return res.send('<script>alert("공지사항은 관리자만 수정할 수 있습니다."); history.back();</script>');
        }

        // [보안] 일반 글은 작성자 본인 또는 관리자만 수정 가능
        if (post.user_id !== req.session.user.user_id && !isAdmin) {
            return res.send('<script>alert("권한이 없습니다."); history.back();</script>');
        }

        res.render('board/edit', { post: post, user: req.session.user });
    });
});

// 6. 글 수정 처리 (POST)
router.post('/edit/:id', checkLogin, (req, res) => {
    let { type, title, content } = req.body;
    const isAdmin = req.session.user.email === 'admin@example.com';

    // [보안] 관리자가 아니면 '공지사항' 선택을 무시하고 강제로 '자유게시판'으로 설정
    if (!isAdmin) {
        type = 'free';
    }

    db.query('UPDATE posts SET type=?, title=?, content=? WHERE post_id=?', 
        [type, title, content, req.params.id], (err) => {
        if (err) throw err;
        res.redirect(`/posts/view/${req.params.id}`);
    });
});

// 7. 삭제 처리
router.get('/delete/:id', checkLogin, (req, res) => {
    const sql = req.session.user.email === 'admin@example.com' 
        ? 'DELETE FROM posts WHERE post_id = ?' 
        : 'DELETE FROM posts WHERE post_id = ? AND user_id = ?'; // 본인 글만 삭제
    
    const params = req.session.user.email === 'admin@example.com' 
        ? [req.params.id] 
        : [req.params.id, req.session.user.user_id];

    db.query(sql, params, (err, result) => {
        if (err) throw err;
        if (result.affectedRows === 0) return res.send('<script>alert("삭제 권한이 없습니다."); history.back();</script>');
        res.redirect('/posts');
    });
});

module.exports = router;