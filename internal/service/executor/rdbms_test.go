package executor

import (
	"context"
	"errors"
	"opsnexus/internal/model"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func mockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	gdb, err := gorm.Open(mysql.New(mysql.Config{Conn: db, SkipInitializeWithVersion: true}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	return gdb, mock
}

func TestQueryFailureHonorsStopOnError(t *testing.T) {
	for _, stop := range []bool{false, true} {
		t.Run(map[bool]string{false: "continue", true: "rollback"}[stop], func(t *testing.T) {
			db, mock := mockDB(t)
			mock.ExpectBegin()
			mock.ExpectQuery("SELECT missing").WillReturnError(errors.New("missing table"))
			if stop {
				mock.ExpectRollback()
			} else {
				mock.ExpectExec("UPDATE items").WillReturnResult(sqlmock.NewResult(0, 2))
				mock.ExpectCommit()
			}
			ch := make(chan model.ExecResult, 4)
			ExecuteGenericBatch(db, "SELECT missing; UPDATE items SET a=1;", stop, ch)
			first := <-ch
			if first.Sequence != 1 || first.Statement != "SELECT missing" || first.Status != "error" {
				t.Fatalf("incomplete error: %+v", first)
			}
			second := <-ch
			if !stop && (second.Status != "success" || second.RowsAffected != 2) {
				t.Fatalf("did not continue: %+v", second)
			}
			if stop && second.Statement != "ROLLBACK" {
				t.Fatalf("missing rollback outcome: %+v", second)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestCommentedQueryReturnsRows(t *testing.T) {
	db, mock := mockDB(t)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT 1").WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow(1))
	mock.ExpectCommit()
	ch := make(chan model.ExecResult, 2)
	ExecuteGenericBatch(db, "-- comment\nSELECT 1", false, ch)
	result := <-ch
	if result.Status != "success" || len(result.Columns) != 1 || result.RowsAffected != 1 {
		t.Fatalf("missing query result: %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCancelledConsumerDoesNotLeakExecutor(t *testing.T) {
	db, mock := mockDB(t)
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectRollback()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := make(chan model.ExecResult)
	done := make(chan struct{})
	go func() { ExecuteGenericBatch(db.WithContext(ctx), "UPDATE items SET a=1", false, ch); close(done) }()
	// Receive the first result, then cancel before any later statement can run.
	select {
	case <-ch:
		cancel()
	case <-time.After(time.Second):
		t.Fatal("executor stalled")
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("executor did not stop after cancellation")
	}
}

func TestAbandonedConsumerStopsOnDeadline(t *testing.T) {
	db, mock := mockDB(t)
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectRollback()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	done := make(chan struct{})
	go func() {
		ExecuteGenericBatch(db.WithContext(ctx), "UPDATE items SET a=1", false, make(chan model.ExecResult))
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("blocked result send leaked executor")
	}
}
